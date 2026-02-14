"""DeepAgent Server - AI Agentic Server with Web UI

Features: Web search, Deep research, MCP server support, Custom tools, Streaming responses, Headless browser control
Supported Models: Claude (Anthropic), GPT-4 (OpenAI), Gemini (Google), Ollama (Local)

CONTEXT WINDOW MANAGEMENT:
- Tool Response Summarization: Large MCP responses are summarized via GPT-4o-mini before entering message history
- Conversation History Summarization: When message token count exceeds threshold, older messages are summarized
- Full data preservation: Raw responses are always saved to disk for reference
- Uses ONLY ChatGPT (OpenAI) for all summarization tasks

MCP TRUNCATION LIMITS (configurable):
- MAX_STRING_LENGTH: 50000 chars
- MAX_LIST_ITEMS: 100 items
- MAX_RESPONSE_SIZE: 500000 chars (threshold before summarization kicks in)
"""

import asyncio
import json
import os
import logging
from typing import List, Dict, Any, Optional, Literal
from datetime import datetime

from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from deepagents import create_deep_agent
from langchain_core.tools import tool
from langchain_community.tools import DuckDuckGoSearchRun
import dotenv

# Load environment variables from .env file
dotenv.load_dotenv()
# Also load from .env.local if present (common in Next.js apps)
if os.path.exists(".env.local"):
    dotenv.load_dotenv(".env.local", override=True)
    print("✓ Loaded environment from .env.local")

# Disable LangSmith tracing IMMEDIATELY if not configured
if not os.getenv("LANGCHAIN_API_KEY"):
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    os.environ["LANGCHAIN_API_KEY"] = ""

# Google Sheets OAuth (graceful degradation)
from fastapi.responses import RedirectResponse
try:
    from google_sheets_auth import GoogleSheetsAuth
    sheets_auth = GoogleSheetsAuth()
    GOOGLE_SHEETS_ENABLED = sheets_auth.is_authenticated() or os.path.exists("client_secrets.json")
    print(f"✓ Google Sheets integration: {'READY' if sheets_auth.is_authenticated() else 'NOT AUTHENTICATED'}")
except Exception as e:
    sheets_auth = None
    GOOGLE_SHEETS_ENABLED = False
    print(f"⚠️  Google Sheets integration disabled: {e}")

# Configure logging to suppress verbose MCP warnings
logging.getLogger("fastmcp").setLevel(logging.ERROR)
logging.getLogger("mcp").setLevel(logging.ERROR)

# ============================================================================
# CONFIGURATION
# ============================================================================

class Config:
    """Server configuration"""
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "8000"))
    MODEL = os.getenv("MODEL", "anthropic:claude-sonnet-4-20250514")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
    
    # MCP configuration file path
    MCP_CONFIG_FILE = os.getenv("MCP_CONFIG_FILE", "mcp_config.json")
    
    # Custom tools directory
    CUSTOM_TOOLS_DIR = os.getenv("CUSTOM_TOOLS_DIR", "custom_tools")
    
    # =========================================================================
    # MCP TRUNCATION LIMITS (CONFIGURABLE)
    # =========================================================================
    MCP_MAX_RESPONSE_SIZE = int(os.getenv("MCP_MAX_RESPONSE_SIZE", "500000"))
    MCP_MAX_STRING_LENGTH = int(os.getenv("MCP_MAX_STRING_LENGTH", "50000"))
    MCP_MAX_LIST_ITEMS = int(os.getenv("MCP_MAX_LIST_ITEMS", "100"))
    
    # =========================================================================
    # CONTEXT WINDOW MANAGEMENT (NEW)
    # =========================================================================
    # Summarization model - uses ChatGPT only
    SUMMARIZER_MODEL = os.getenv("SUMMARIZER_MODEL", "gpt-5")
    
    # Tool response summarization: summarize MCP responses larger than this (chars)
    TOOL_RESPONSE_SUMMARIZE_THRESHOLD = int(os.getenv("TOOL_RESPONSE_SUMMARIZE_THRESHOLD", "50000"))
    
    # Conversation summarization: summarize when total message tokens exceed this
    CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD = int(os.getenv("CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD", "100000"))
    
    # Number of recent messages to keep verbatim (not summarized)
    CONVERSATION_KEEP_RECENT_MESSAGES = int(os.getenv("CONVERSATION_KEEP_RECENT_MESSAGES", "20"))
    
    # Max chars to feed into the summarizer LLM at once
    SUMMARIZER_INPUT_LIMIT = int(os.getenv("SUMMARIZER_INPUT_LIMIT", "200000"))

config = Config()

# ============================================================================
# CONTEXT WINDOW MANAGER (ChatGPT-based)
# ============================================================================

class ContextWindowManager:
    """Manages context window using ChatGPT for summarization.
    
    Two responsibilities:
    1. Summarize large MCP tool responses before they enter message history
    2. Summarize older conversation messages when total tokens exceed threshold
    """
    
    def __init__(self):
        self._summarizer = None
    
    def _get_summarizer(self):
        """Lazy-initialize the ChatGPT summarizer."""
        if self._summarizer is None:
            try:
                from langchain_openai import ChatOpenAI
                self._summarizer = ChatOpenAI(
                    model=config.SUMMARIZER_MODEL,
                    temperature=0,
                    max_tokens=4096,
                    api_key=config.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY"),
                )
                print(f"✓ Context summarizer initialized: {config.SUMMARIZER_MODEL}")
            except Exception as e:
                print(f"⚠️  Failed to initialize summarizer: {e}")
                print("   Falling back to truncation-only mode")
                self._summarizer = None
        return self._summarizer
    
    def estimate_tokens(self, text: str) -> int:
        """Rough token estimate: ~4 chars per token for English text."""
        return len(text) // 4
    
    def estimate_messages_tokens(self, messages: list) -> int:
        """Estimate total tokens across all messages."""
        total = 0
        for msg in messages:
            if hasattr(msg, 'content'):
                content = str(msg.content)
            elif isinstance(msg, dict):
                content = str(msg.get('content', ''))
            else:
                content = str(msg)
            total += self.estimate_tokens(content)
        return total
    
    async def summarize_tool_response(self, tool_name: str, result_str: str) -> str:
        """Summarize a large MCP tool response using ChatGPT.
        
        Preserves all critical data (IDs, names, amounts, dates, statuses)
        while removing redundant metadata and formatting.
        
        Falls back to intelligent truncation if summarizer is unavailable.
        """
        summarizer = self._get_summarizer()
        
        if summarizer is None:
            # Fallback: truncate with context
            return self._truncate_with_context(result_str)
        
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            
            # Trim input to summarizer's context limit
            input_text = result_str[:config.SUMMARIZER_INPUT_LIMIT]
            
            messages = [
                SystemMessage(content="""You are a data extraction assistant. Your job is to summarize large tool/API responses 
into a compact format that preserves ALL actionable information.

RULES:
- Preserve ALL: record IDs, names, amounts, dates, stages, statuses, owners, types
- Preserve ALL: relationships, lookup fields, reference IDs, counts, aggregates
- Preserve ALL: error messages, warnings, validation failures
- Remove: redundant metadata fields (attributes, urls, api types), duplicate nested references
- Remove: null/empty fields, system timestamps that aren't business-relevant
- Format: Use structured text, not JSON. Group related records logically.
- If data contains records/rows, present them as a concise numbered list with key fields
- Always state the total count of records at the top
- Keep your summary under 5000 words"""),
                HumanMessage(content=f"Summarize this {tool_name} response ({len(result_str):,} chars):\n\n{input_text}")
            ]
            
            response = await summarizer.ainvoke(messages)
            summary = response.content
            
            # Add metadata footer
            summary += f"\n\n[Summarized from {len(result_str):,} chars. Full data saved to disk.]"
            
            print(f"  ✓ Summarized {tool_name} response: {len(result_str):,} → {len(summary):,} chars")
            return summary
            
        except Exception as e:
            print(f"  ⚠️  Summarization failed for {tool_name}: {e}")
            return self._truncate_with_context(result_str)
    
    async def summarize_conversation_history(self, messages: list) -> list:
        """Summarize older messages when conversation exceeds token threshold.
        
        Strategy:
        - Keep the most recent N messages verbatim (they contain current context)
        - Summarize everything before that into a single context message
        - The agent sees: [summary_of_history] + [recent_messages]
        
        Returns the compressed message list.
        """
        total_tokens = self.estimate_messages_tokens(messages)
        
        if total_tokens < config.CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD:
            return messages  # No summarization needed
        
        keep_count = config.CONVERSATION_KEEP_RECENT_MESSAGES
        
        if len(messages) <= keep_count:
            return messages  # Not enough messages to summarize
        
        # Split: older messages to summarize, recent messages to keep
        older_messages = messages[:-keep_count]
        recent_messages = messages[-keep_count:]
        
        print(f"  📝 Summarizing conversation: {len(messages)} messages ({total_tokens:,} tokens)")
        print(f"     Summarizing {len(older_messages)} older messages, keeping {len(recent_messages)} recent")
        
        summarizer = self._get_summarizer()
        
        if summarizer is None:
            # Fallback: just keep recent messages
            return recent_messages
        
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            
            # Build text representation of older messages
            history_text = ""
            for msg in older_messages:
                if hasattr(msg, 'content'):
                    role = getattr(msg, 'type', 'unknown')
                    content = str(msg.content)
                elif isinstance(msg, dict):
                    role = msg.get('role', 'unknown')
                    content = str(msg.get('content', ''))
                else:
                    role = 'unknown'
                    content = str(msg)
                
                # Truncate very long individual messages
                if len(content) > 10000:
                    content = content[:10000] + "...[truncated]"
                
                history_text += f"[{role}]: {content}\n\n"
            
            # Trim to summarizer input limit
            history_text = history_text[:config.SUMMARIZER_INPUT_LIMIT]
            
            summary_messages = [
                SystemMessage(content="""You are a conversation summarizer for an AI agent system.

Summarize the conversation history preserving ALL:
- What the user asked for and the agent's conclusions/answers
- Key data points retrieved (record IDs, names, amounts, statuses, dates)
- Decisions made, actions taken, tools called and their outcomes
- Any errors encountered and how they were resolved
- Current task context and what the user is working towards

Format as a structured summary with sections. Be thorough but concise.
Keep under 3000 words."""),
                HumanMessage(content=f"Summarize this conversation history ({len(older_messages)} messages):\n\n{history_text}")
            ]
            
            response = await summarizer.ainvoke(summary_messages)
            summary_content = response.content
            
            # Create a summary message to prepend
            summary_msg = {
                "role": "system",
                "content": f"[CONVERSATION HISTORY SUMMARY]\n{summary_content}\n[END SUMMARY - Recent messages follow below]"
            }
            
            compressed = [summary_msg] + [
                {"role": msg.get("role", "user") if isinstance(msg, dict) else getattr(msg, 'type', 'user').replace('human', 'user').replace('ai', 'assistant'),
                 "content": msg.get("content", "") if isinstance(msg, dict) else str(getattr(msg, 'content', ''))}
                for msg in recent_messages
            ]
            
            new_tokens = self.estimate_messages_tokens(compressed)
            print(f"  ✓ Conversation compressed: {total_tokens:,} → {new_tokens:,} tokens")
            
            return compressed
            
        except Exception as e:
            print(f"  ⚠️  Conversation summarization failed: {e}")
            # Fallback: keep only recent messages
            return recent_messages
    
    def _truncate_with_context(self, text: str, max_length: int = None) -> str:
        """Intelligent truncation fallback: keep beginning and end."""
        max_len = max_length or config.MCP_MAX_STRING_LENGTH
        if len(text) <= max_len:
            return text
        
        # Keep 70% from start, 30% from end
        head_size = int(max_len * 0.7)
        tail_size = int(max_len * 0.25)
        
        return (
            text[:head_size] +
            f"\n\n...[TRUNCATED {len(text) - head_size - tail_size:,} chars]...\n\n" +
            text[-tail_size:]
        )

# Global context manager
context_manager = ContextWindowManager()

# ============================================================================
# BUILT-IN TOOLS
# ============================================================================

duckduckgo_search = DuckDuckGoSearchRun()

@tool
def get_current_time() -> str:
    """Get the current date and time."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ============================================================================
# CUSTOM TOOLS LOADER
# ============================================================================

class CustomToolsLoader:
    """Load custom tools from Python files"""
    
    @staticmethod
    def load_tools_from_directory(directory: str) -> List[Any]:
        """Load custom tools from Python files in a directory."""
        tools = []
        
        if not os.path.exists(directory):
            os.makedirs(directory)
            example_tool = '''"""Example custom tool"""
from langchain_core.tools import tool

@tool
def example_calculator(a: float, b: float, operation: str = "add") -> float:
    """Perform basic arithmetic operations.
    
    Args:
        a: First number
        b: Second number
        operation: Operation to perform (add, subtract, multiply, divide)
    
    Returns:
        Result of the operation
    """
    if operation == "add":
        return a + b
    elif operation == "subtract":
        return a - b
    elif operation == "multiply":
        return a * b
    elif operation == "divide":
        if b == 0:
            return "Error: Division by zero"
        return a / b
    else:
        return "Error: Unknown operation"
'''
            with open(os.path.join(directory, "example_tools.py"), "w") as f:
                f.write(example_tool)
        
        import sys
        import importlib.util
        
        for filename in os.listdir(directory):
            if filename.endswith(".py") and not filename.startswith("__"):
                filepath = os.path.join(directory, filename)
                try:
                    spec = importlib.util.spec_from_file_location(filename[:-3], filepath)
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[filename[:-3]] = module
                    spec.loader.exec_module(module)
                    
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if hasattr(attr, "name") and hasattr(attr, "description"):
                            tools.append(attr)
                            print(f"Loaded custom tool: {attr.name}")
                except Exception as e:
                    print(f"Error loading tools from {filename}: {e}")
        
        return tools

# ============================================================================
# MCP CONFIGURATION MANAGER
# ============================================================================

class MCPConfigManager:
    """Manage MCP server configurations"""
    
    def __init__(self, config_file: str):
        self.config_file = config_file
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        if os.path.exists(self.config_file):
            with open(self.config_file, 'r') as f:
                return json.load(f)
        else:
            default_config = {
                "mcp_servers": {
                    "example_filesystem": {
                        "command": "npx",
                        "args": ["-y", "@modelcontextprotocol/server-filesystem", "./workspace"],
                        "transport": "stdio",
                        "enabled": False
                    }
                }
            }
            self.save_config(default_config)
            return default_config
    
    def save_config(self, config: Dict[str, Any]):
        with open(self.config_file, 'w') as f:
            json.dump(config, f, indent=2)
        self.config = config
    
    def get_enabled_servers(self) -> Dict[str, Any]:
        mcp_servers = self.config.get("mcp_servers", {})
        enabled_servers = {}
        for name, cfg in mcp_servers.items():
            if cfg.get("enabled", False):
                server_config = {k: v for k, v in cfg.items() if k != "enabled"}
                enabled_servers[name] = server_config
        return enabled_servers

# ============================================================================
# AGENT MANAGER
# ============================================================================

class AgentManager:
    """Manage DeepAgent instances with context window management"""
    
    def __init__(self):
        self.mcp_config_manager = MCPConfigManager(config.MCP_CONFIG_FILE)
        self.custom_tools_loader = CustomToolsLoader()
        self.agent = None
        self.mcp_client = None
    
    async def initialize_agent(self, 
                              instructions: Optional[str] = None,
                              enable_research: bool = True,
                              model: Optional[str] = None,
                              headless: bool = True):
        """Initialize the DeepAgent with all tools and context management"""
        
        # Built-in tools
        tools = [
            duckduckgo_search,
            get_current_time
        ]
        
        # Load custom tools
        custom_tools = self.custom_tools_loader.load_tools_from_directory(config.CUSTOM_TOOLS_DIR)
        
        # Wrap browser tools to enforce headless mode
        wrapped_custom_tools = []
        for t in custom_tools:
            if t.name in ['browser_research', 'browser_research_multiple', 'browser_interactive_research']:
                original_func = t.coroutine if hasattr(t, 'coroutine') else t.func
                
                def create_wrapped_browser_tool(original, headless_val):
                    async def wrapped_func(*args, **kwargs):
                        kwargs['headless'] = headless_val
                        if asyncio.iscoroutinefunction(original):
                            return await original(*args, **kwargs)
                        else:
                            return original(*args, **kwargs)
                    return wrapped_func
                
                wrapped_func = create_wrapped_browser_tool(original_func, headless)
                
                from langchain_core.tools import StructuredTool
                wrapped_tool = StructuredTool(
                    name=t.name,
                    description=t.description + f" (Browser mode: {'headless/invisible' if headless else 'visible/slow'})",
                    coroutine=wrapped_func,
                    args_schema=t.args_schema
                )
                wrapped_custom_tools.append(wrapped_tool)
                print(f"✓ Wrapped browser tool: {t.name} with headless={headless}")
            else:
                wrapped_custom_tools.append(t)
        
        tools.extend(wrapped_custom_tools)
        
        # Load MCP tools and wrap them with context-aware summarization
        enabled_mcp_servers = self.mcp_config_manager.get_enabled_servers()
        print(f"Enabled MCP servers: {list(enabled_mcp_servers.keys())}")
        
        if enabled_mcp_servers:
            try:
                from langchain_mcp_adapters.client import MultiServerMCPClient
                from langchain_core.tools import StructuredTool
                import sys
                import io
                
                print("Creating MCP client...")
                
                old_stderr = sys.stderr
                sys.stderr = io.StringIO()
                
                try:
                    self.mcp_client = MultiServerMCPClient(enabled_mcp_servers)
                    print("Getting MCP tools...")
                    mcp_tools = await self.mcp_client.get_tools()
                finally:
                    sys.stderr = old_stderr
                
                def wrap_mcp_tool(original_tool):
                    """Wrap MCP tool with ChatGPT-based summarization for large responses.
                    
                    Flow:
                    1. Call original tool
                    2. If response > threshold: save to disk + summarize via GPT-4o-mini
                    3. Return summarized (or original if small) response
                    """
                    original_func = original_tool.coroutine if hasattr(original_tool, 'coroutine') else original_tool.func
                    
                    async def wrapped_func(*args, **kwargs):
                        # Call original tool
                        if asyncio.iscoroutinefunction(original_func):
                            result = await original_func(*args, **kwargs)
                        else:
                            result = original_func(*args, **kwargs)
                        
                        if asyncio.iscoroutine(result):
                            result = await result
                        
                        # Handle tuple results from MCP tools
                        if isinstance(result, tuple):
                            result = result[0] if len(result) > 0 else result
                        
                        # Try to parse JSON strings
                        if isinstance(result, str):
                            try:
                                result = json.loads(result)
                            except:
                                pass
                        
                        # Convert to string for size check
                        result_str = json.dumps(result, default=str) if isinstance(result, (dict, list)) else str(result)
                        
                        SUMMARIZE_THRESHOLD = config.TOOL_RESPONSE_SUMMARIZE_THRESHOLD
                        MAX_RESPONSE_SIZE = config.MCP_MAX_RESPONSE_SIZE
                        MAX_STRING_LENGTH = config.MCP_MAX_STRING_LENGTH
                        MAX_LIST_ITEMS = config.MCP_MAX_LIST_ITEMS
                        
                        # =====================================================
                        # SMALL RESPONSE: Return as-is
                        # =====================================================
                        if len(result_str) <= SUMMARIZE_THRESHOLD:
                            return result
                        
                        # =====================================================
                        # LARGE RESPONSE: Save to disk first (always)
                        # =====================================================
                        os.makedirs("mcp_output", exist_ok=True)
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        filename = f"mcp_output/{original_tool.name}_{timestamp}.json"
                        
                        with open(filename, 'w') as f:
                            try:
                                if isinstance(result, (dict, list)):
                                    json.dump(result, f, indent=2, default=str)
                                else:
                                    f.write(result_str)
                            except:
                                f.write(result_str)
                        
                        print(f"  💾 Saved full response to {filename} ({len(result_str):,} chars)")
                        
                        # =====================================================
                        # MEDIUM RESPONSE (50K-500K): Summarize via ChatGPT
                        # =====================================================
                        if len(result_str) <= MAX_RESPONSE_SIZE:
                            try:
                                summarized = await context_manager.summarize_tool_response(
                                    original_tool.name, result_str
                                )
                                return summarized
                            except Exception as e:
                                print(f"  ⚠️  Summarization failed, falling back to truncation: {e}")
                                # Fall through to truncation
                        
                        # =====================================================
                        # VERY LARGE RESPONSE (>500K): Truncate then summarize
                        # =====================================================
                        # First do structural truncation to get it under 500K
                        if isinstance(result, dict):
                            truncated_result = {}
                            for key, value in result.items():
                                if isinstance(value, str) and len(value) > MAX_STRING_LENGTH:
                                    truncated_result[key] = value[:MAX_STRING_LENGTH] + "...[truncated]"
                                elif isinstance(value, list) and len(value) > MAX_LIST_ITEMS:
                                    truncated_result[key] = value[:MAX_LIST_ITEMS]
                                    truncated_result[key].append(f"... and {len(value) - MAX_LIST_ITEMS} more items")
                                else:
                                    truncated_result[key] = value
                            truncated_str = json.dumps(truncated_result, default=str)
                            
                        elif isinstance(result, list):
                            truncated_list = []
                            for item in result[:MAX_LIST_ITEMS]:
                                if isinstance(item, dict):
                                    truncated_item = {}
                                    for key, value in item.items():
                                        if isinstance(value, str) and len(value) > MAX_STRING_LENGTH:
                                            truncated_item[key] = value[:MAX_STRING_LENGTH] + "...[truncated]"
                                        else:
                                            truncated_item[key] = value
                                    truncated_list.append(truncated_item)
                                else:
                                    truncated_list.append(item)
                            
                            if len(result) > MAX_LIST_ITEMS:
                                truncated_list.append(f"... and {len(result) - MAX_LIST_ITEMS} more items")
                            truncated_str = json.dumps(truncated_list, default=str)
                        else:
                            truncated_str = result_str[:MAX_STRING_LENGTH]
                        
                        # Now summarize the truncated version
                        try:
                            summarized = await context_manager.summarize_tool_response(
                                original_tool.name, truncated_str
                            )
                            return summarized
                        except Exception as e:
                            print(f"  ⚠️  Summarization failed on truncated data: {e}")
                            return truncated_str[:MAX_STRING_LENGTH] + f"\n\n[Response truncated. Full data: {filename}]"
                    
                    return StructuredTool(
                        name=original_tool.name,
                        description=original_tool.description,
                        coroutine=wrapped_func,
                        args_schema=original_tool.args_schema
                    )
                
                # Wrap all MCP tools
                wrapped_tools = [wrap_mcp_tool(t) for t in mcp_tools]
                tools.extend(wrapped_tools)
                
                print(f"✓ Loaded {len(mcp_tools)} MCP tools from {len(enabled_mcp_servers)} servers (with ChatGPT summarization)")
                print(f"  Tool names: {[t.name for t in mcp_tools]}")
                print(f"  Summarize threshold: {config.TOOL_RESPONSE_SUMMARIZE_THRESHOLD:,} chars")
                print(f"  Summarizer model: {config.SUMMARIZER_MODEL}")
                
            except ImportError:
                print("Warning: langchain-mcp-adapters not installed. MCP support disabled.")
                print("Install with: pip install langchain-mcp-adapters")
            except Exception as e:
                print(f"Error loading MCP tools: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("No enabled MCP servers found in config")
        
        # Define subagents for deep research
        subagents = []
        if enable_research:
            research_sub_agent = {
                "name": "research-agent",
                "description": "Conducts detailed research on specific topics using web search",
                "system_prompt": """You are a dedicated researcher.
Your job is to conduct thorough research based on the assigned topic.
Use duckduckgo_search to find relevant information.
Save your findings to files for reference.
Only your FINAL answer will be passed back to the main agent.""",
                "tools": [duckduckgo_search]
            }
            
            critique_sub_agent = {
                "name": "critique-agent",
                "description": "Reviews and critiques reports and research outputs",
                "system_prompt": """You are a dedicated editor and critic.
Review the report or output provided to you.
Provide constructive feedback on accuracy, completeness, and clarity.
Be specific about what needs improvement."""
            }
            
            subagents = [research_sub_agent, critique_sub_agent]
        
        # Default instructions
        if instructions is None:
            browser_mode = "headless=True (invisible, fast)" if headless else "headless=False (visible, slow)"
            instructions = f"""You are an expert AI assistant with access to web search, MCP tools, browser automation, and file operations.

CAPABILITIES:
- Web search using DuckDuckGo (free, no API key needed)
- Browser automation with Playwright (currently in {browser_mode} mode)
- MCP tools for database operations, APIs, and integrations
- File operations (write_file, read_file, edit_file, ls, grep_search, glob_search)
- Deep research using specialized research agents
- Custom tools for specialized tasks

🌐 BROWSER AUTOMATION INSTRUCTIONS:
- Current browser mode: {browser_mode}
- ALWAYS pass headless={headless} to browser_research and browser_research_multiple tools
- Use browser tools after max 3-5 DuckDuckGo searches (don't over-search!)
- For deep research: search → get URLs → use browser_research_multiple
- Never make more than 5 consecutive DuckDuckGo searches

🚨 CRITICAL RESPONSE RULES 🚨

1. NEVER include raw tool outputs in your response
2. NEVER paste JSON data, API responses, or database records directly
3. ALWAYS extract and summarize the key information
4. Your response should be human-readable, not machine data

CORRECT RESPONSE FORMAT:
✅ "The opportunity 'Humain_S2P' has an amount of $160,000 and closes on April 1, 2026."
✅ "I found 3 related documents: Document A, Document B, and Document C."
✅ "The account has 5 open opportunities totaling $2.5M."

INCORRECT RESPONSE FORMAT:
❌ Pasting raw JSON like: {{"attributes":{{"type":"Opportunity"}},"Id":"006P700000O0NMzIAN"...}}
❌ Pasting entire JSON objects
❌ Including raw database records

WORKFLOW:
1. Call the necessary tools to get data
2. ANALYZE the data internally (don't show this to user)
3. EXTRACT the key information that answers the question
4. RESPOND with a clear, human-readable summary

HANDLING TOOL RESPONSES:
- Tool responses are automatically summarized by an AI assistant when they are large
- The summarized data preserves all key fields (IDs, names, amounts, dates, statuses)
- Use the summarized data directly to answer the user's question
- DO NOT mention summarization, truncation, or saved files to the user
- Just extract and present the information naturally

REMEMBER: Users want insights, not data dumps. Be conversational and helpful!"""
        
        selected_model = model or config.MODEL
        
        print(f"Creating agent with model: {selected_model}")
        print(f"Number of tools: {len(tools)}")
        print(f"Tool names: {[t.name for t in tools]}")
        print(f"Browser mode: {'headless' if headless else 'visible'}")
        print(f"Context management: ChatGPT ({config.SUMMARIZER_MODEL})")
        
        self.agent = create_deep_agent(
            tools=tools,
            system_prompt=instructions,
            subagents=subagents,
            model=selected_model,
            debug=False
        )
        
        print(f"✓ Agent initialized with {len(tools)} tools and {len(subagents)} subagents")
        return self.agent
    
    async def get_agent(self):
        if self.agent is None:
            await self.initialize_agent()
        return self.agent
    
    async def reinitialize_agent(self, instructions: Optional[str] = None, model: Optional[str] = None, headless: bool = True):
        self.agent = None
        if self.mcp_client:
            self.mcp_client = None
        return await self.initialize_agent(instructions, model=model, headless=headless)

# ============================================================================
# FASTAPI APP
# ============================================================================

app = FastAPI(
    title="DeepAgent Server",
    description="AI Agentic Server with Context Window Management via ChatGPT",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent_manager = AgentManager()

# ============================================================================
# API MODELS
# ============================================================================

class ChatMessage(BaseModel):
    role: str
    content: str

class GoogleSheetConfig(BaseModel):
    spreadsheet_id: str
    sheet_name: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    stream: bool = True
    enable_research: bool = True
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    headless: bool = True
    google_sheets: Optional[List[GoogleSheetConfig]] = None

class StructuredChatRequest(BaseModel):
    messages: List[ChatMessage]
    structured_output_format: Dict[str, Any]
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    enable_research: bool = False
    headless: bool = True
    google_sheets: Optional[List[GoogleSheetConfig]] = None

class ConfigRequest(BaseModel):
    instructions: Optional[str] = None
    enable_research: bool = True
    headless: bool = True

class MCPServerConfig(BaseModel):
    command: str
    args: List[str]
    env: Optional[Dict[str, str]] = None
    enabled: bool = True

# ============================================================================
# API ENDPOINTS
# ============================================================================

# Add imports
try:
    from supabase import create_client, Client
except ImportError:
    print("Warning: supabase package not found. Install with: pip install supabase")
    Client = None

# ... (Config updates) ...

class Config:
    """Server configuration"""
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "8000"))
    # ... (existing config) ...
    SUPABASE_URL = os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# ... (Initialize client) ...
supabase: Optional[Client] = None
if config.SUPABASE_URL and config.SUPABASE_SERVICE_KEY and Client:
    try:
        supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
        print(f"✓ Supabase client initialized: {config.SUPABASE_URL}")
    except Exception as e:
        print(f"⚠️  Failed to initialize Supabase: {e}")

# ... (ChatRequest update) ...
class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    stream: bool = True
    enable_research: bool = True
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    headless: bool = True
    google_sheets: Optional[List[GoogleSheetConfig]] = None
    chat_id: Optional[str] = None  # Added for DB logging

# ... (Chat logic update) ...
@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Chat endpoint with streaming support, browser control, and context management"""
    try:
        print(f"\n{'='*60}")
        print(f"[API REQUEST] /api/chat")
        print(f"Model: {request.model}")
        print(f"Stream: {request.stream}")
        print(f"Chat ID: {request.chat_id}")
        
        # ... (rest of setup) ...
        
        if request.stream:
            async def generate():
                try:
                    final_response = ""
                    step_count = 0
                    seen_tool_calls = set()
                    seen_tool_results = set()
                    
                    # Accumulators for DB logging
                    thinking_logs = []
                    
                    print(f"\n{'🚀'*30}")
                    print(f"[AGENT STREAM STARTED]")
                    
                    async for chunk in agent.astream({"messages": messages}, stream_mode="values"):
                        if "messages" not in chunk or not chunk["messages"]:
                            continue
                        
                        last_message = chunk["messages"][-1]
                        msg_type = type(last_message).__name__
                        
                        # Handle AIMessage with tool calls
                        if msg_type == "AIMessage" and hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                            for tool_call in last_message.tool_calls:
                                tool_call_id = f"{tool_call.get('name', 'unknown')}_{tool_call.get('id', '')}"
                                if tool_call_id in seen_tool_calls:
                                    continue
                                seen_tool_calls.add(tool_call_id)
                                
                                step_count += 1
                                tool_name = tool_call.get('name', 'unknown')
                                tool_args = tool_call.get('args', {})
                                tool_args_str = json.dumps(tool_args, indent=2)
                                
                                log_entry = f"Calling **{tool_name}** with args: `{tool_args_str}`"
                                thinking_logs.append(log_entry)
                                
                                print(f"\n{'🔧'*30}")
                                print(f"[TOOL CALL] Step {step_count}: {tool_name}")
                                print(f"Args: {tool_args_str[:500]}")
                                print(f"{'🔧'*30}\n")
                                
                                yield f"data: {json.dumps({'type': 'tool_call', 'tool': tool_name, 'args': tool_args})}\n\n"
                                yield f"data: {json.dumps({'type': 'thinking', 'content': f'Calling {tool_name}...'})}\n\n"
                        
                        # Handle ToolMessage
                        elif msg_type == "ToolMessage":
                            tool_result_id = getattr(last_message, 'tool_call_id', 'unknown')
                            if tool_result_id not in seen_tool_results:
                                seen_tool_results.add(tool_result_id)
                                tool_content = str(last_message.content)
                                tool_name = getattr(last_message, 'name', 'unknown')
                                
                                # Truncate for log/UI
                                display_content = tool_content[:500] + ("..." if len(tool_content) > 500 else "")
                                log_entry = f"Result from **{tool_name}**: \n> {display_content}"
                                thinking_logs.append(log_entry)
                                
                                print(f"\n{'✅'*30}")
                                print(f"[TOOL RESULT] Preview: {tool_content[:500]}...")
                                print(f"{'✅'*30}\n")
                                
                                yield f"data: {json.dumps({'type': 'tool_result', 'tool': tool_name, 'result': tool_content})}\n\n"
                        
                        # Handle AIMessage with content
                        elif msg_type == "AIMessage" and hasattr(last_message, 'content') and last_message.content:
                            content = str(last_message.content).strip()
                            if content and content != final_response:
                                final_response = content
                                yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                    
                    if final_response:
                        print(f"\n{'🎯'*30}")
                        print(f"[FINAL RESPONSE] Tool calls: {step_count}, Length: {len(final_response)} chars")
                        print(f"{'🎯'*30}\n")
                        yield f"data: {json.dumps({'type': 'final', 'content': final_response})}\n\n"
                        
                        # --- SAVE TO SUPABASE ---
                        if request.chat_id and supabase:
                            try:
                                # Combine thinking logs and final response
                                # Format: Thinking steps followed by response
                                # Note: Ideally we store thinking logs in a separate column, but for now we append.
                                
                                # Check if we want to prepend or use a structure.
                                # Let's mirror what the UI does conceptually or just store raw?
                                # The user said "store everything".
                                
                                # Construct a rich content block
                                db_content = final_response
                                # (Optional: Prepend logs if you want them in the history)
                                # db_content = f"### Thinking Process\n{chr(10).join(thinking_logs)}\n\n### Response\n{final_response}"
                                
                                # Better: Insert the helper message if we can, or just the assistant message.
                                # Usually we just want the final answer.
                                # BUT the user said "I need a log for that too".
                                
                                # Let's try to insert the thinking logs as a separate 'system' or 'thinking' message?
                                # No, standardized on 'assistant'.
                                # I will store the logs in a `metadata` column if it exists, otherwise prepend to content?
                                # Let's prepend safely.
                                
                                if thinking_logs:
                                    # Create a collapsible detail block if Markdown supports it?
                                    # Or just bullet points.
                                    logs_str = "\n".join([f"- {l}" for l in thinking_logs])
                                    # Store logs in a hidden way or explicit way?
                                    # I will NOT modify the visible content too much to avoid clutter.
                                    # Let's assume the user wants the logs saved. I will append them at the VERY END.
                                    pass 
                                
                                # Actually, just saving the assistant response is critical.
                                # The 'logs' are transient.
                                # But I will save the 'thinking_steps' in the `thinking_steps` column if it exists?
                                # I don't know the schema.
                                # I'll stick to inserting `content = final_response` for now, maybe with logs if requested.
                                # Wait, user said "what is the response of that call and then store everything".
                                # I'll append the tool logs to the content.
                                
                                full_content_with_logs = final_response
                                if thinking_logs:
                                   full_content_with_logs = f"### Thinking Process\n\n" + "\n\n".join(thinking_logs) + f"\n\n### Answer\n\n{final_response}"

                                supabase.table("chat_messages").insert({
                                    "chat_id": request.chat_id,
                                    "role": "assistant",
                                    "content": full_content_with_logs
                                }).execute()
                                print(f"  💾 Saved assistant message to DB for Chat {request.chat_id}")
                            except Exception as db_err:
                                print(f"  ⚠️ Failed to save to Supabase: {db_err}")
                                yield f"data: {json.dumps({'type': 'error', 'content': f'DB Save Error: {str(db_err)}'})}\n\n"

                    else:
                        print(f"\n⚠️  WARNING: No final response generated!\n")
                        yield f"data: {json.dumps({'type': 'final', 'content': 'Task completed.'})}\n\n"
                    
                except Exception as e:
                    # ... error handling ...
                    pass

            return StreamingResponse(generate(), media_type="text/event-stream")
        
        # ... (rest of function) ...
        else:
            print(f"\n[NON-STREAMING REQUEST] Messages: {len(messages)}\n")
            
            result = await agent.ainvoke({"messages": messages})
            
            tool_call_count = 0
            for msg in result.get("messages", []):
                if hasattr(msg, 'tool_calls') and msg.tool_calls:
                    tool_call_count += len(msg.tool_calls)
            
            print(f"\n[NON-STREAMING COMPLETE] Tool calls: {tool_call_count}\n")
            
            return {
                "response": result["messages"][-1].content,
                "done": True
            }
    
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"\n[ERROR] /api/chat failed:\n{error_detail}\n")
from fastapi import BackgroundTasks

@app.post("/api/chat/async")
async def chat_async(request: ChatRequest, background_tasks: BackgroundTasks):
    """
    Async chat endpoint that returns immediately and processes in background.
    Events are logged to Supabase for the client to consume via Realtime.
    """
    import asyncio
    
    async def run_chat_background():
        # Create a mock generator to consume the stream and trigger side effects (DB logs)
        # We re-use the existing 'chat' logic but just iterate over it.
        # Note: The 'chat' function is an async generator endpoint. 
        # We need to call the underlying generator logic directly or wrapped.
        
        # Let's extract the core logic of 'chat' into a helper if possible, 
        # or just invoke it and consume the stream.
        
        # ACTUALLY: The `chat` function above is an endpoint that returns a StreamingResponse.
        # We can't easily call it directly from here and just "consume" it without overhead.
        # Better to copy the core logic or refactor.
        # FOR NOW: Let's inline the logic or use a helper. 
        # Since I can't refactor the whole file easily in one go, I will implement the logic here 
        # targeting the DB writing specifically.
        
        try:
            print(f"[ASYNC] Starting background task for chat {request.chat_id}")
            agent = await agent_manager.get_agent()
            
            messages = [
                {"role": msg.role, "content": msg.content}
                for msg in request.messages
            ]
            
            # System prompt handling
            if request.system_prompt:
                 # Check if system prompt is already the first message, if not prepend
                 if not messages or messages[0].get("role") != "system":
                     messages.insert(0, {"role": "system", "content": request.system_prompt})
                 else:
                     messages[0]["content"] = request.system_prompt + "\n\n" + messages[0]["content"]
            
            final_response = ""
            thinking_logs = []
            seen_tool_calls = set()
            
            # Log "started" status
            if supabase and request.chat_id:
                supabase.table("chat_messages").insert({
                    "chat_id": request.chat_id,
                    "role": "assistant", # or system
                    "content": "started",
                    "type": "status",
                    # "metadata": {"status": "started"} 
                }).execute()

            async for chunk in agent.astream({"messages": messages}, stream_mode="values"):
                if "messages" not in chunk or not chunk["messages"]:
                    continue
                
                last_message = chunk["messages"][-1]
                msg_type = type(last_message).__name__
                
                # DB LOGGING HELPERS
                def log_to_db(type_name, content, metadata=None):
                    if supabase and request.chat_id:
                        try:
                            payload = {
                                "chat_id": request.chat_id,
                                "role": "assistant", # All agent events are assistant
                                "content": content,
                                "type": type_name
                            }
                            if metadata:
                                payload["metadata"] = metadata
                            supabase.table("chat_messages").insert(payload).execute()
                        except Exception as e:
                            print(f"DB Error: {e}")

                # 1. TOOL CALLS
                if msg_type == "AIMessage" and hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                    for tool_call in last_message.tool_calls:
                        tool_call_id = f"{tool_call.get('name', 'unknown')}_{tool_call.get('id', '')}"
                        if tool_call_id in seen_tool_calls:
                            continue
                        seen_tool_calls.add(tool_call_id)
                        
                        tool_name = tool_call.get('name', 'unknown')
                        tool_args = tool_call.get('args', {})
                        
                        print(f"[ASYNC] Tool Call: {tool_name}")
                        log_to_db("tool_call", "", {"tool": tool_name, "args": tool_args})
                        log_to_db("status", "processing") # Keep UI spinning

                # 2. TOOL RESULTS
                elif msg_type == "ToolMessage":
                    # We might want to dedup results too if needed, but usually they come once.
                    # We can use the tool_call_id to dedup if necessary.
                    # For now just log.
                    tool_name = getattr(last_message, 'name', 'unknown')
                    content = str(last_message.content)
                    print(f"[ASYNC] Tool Result: {tool_name}")
                    log_to_db("tool_result", content, {"tool": tool_name})

                # 3. TEXT CONTENT (Streaming tokens vs Final)
                # LangGraph 'values' stream gives full messages, not tokens.
                # So we see the message grow. We don't want to log every token update to DB (too spammy).
                # We only want to log the FINAL response.
                elif msg_type == "AIMessage" and hasattr(last_message, 'content') and last_message.content:
                     # Just track it locally. We log final at the end.
                     final_response = str(last_message.content).strip()

            # FINISHED - Log final response
            if final_response:
                print(f"[ASYNC] Final Response: {len(final_response)} chars")
                if supabase and request.chat_id:
                    supabase.table("chat_messages").insert({
                        "chat_id": request.chat_id,
                        "role": "assistant",
                        "content": final_response,
                        "type": "final" 
                    }).execute()
                    
                    # Mark status done
                    supabase.table("chat_messages").insert({
                        "chat_id": request.chat_id,
                        "role": "assistant",
                        "content": "done",
                        "type": "status"
                    }).execute()
            
        except Exception as e:
            print(f"[ASYNC ERROR] {e}")
            import traceback
            traceback.print_exc()
            if supabase and request.chat_id:
                 supabase.table("chat_messages").insert({
                    "chat_id": request.chat_id,
                    "role": "assistant",
                    "content": str(e),
                    "type": "error"
                }).execute()

    # Start independent task
    background_tasks.add_task(run_chat_background)
    
    return {"status": "started", "chat_id": request.chat_id}

@app.post("/api/chat/structured")
async def structured_chat(request: StructuredChatRequest):
    """Chat endpoint with structured output support and context management"""
    try:
        from langchain_core.output_parsers import JsonOutputParser
        from langchain_core.prompts import ChatPromptTemplate
        
        system_prompt = request.system_prompt
        if request.google_sheets:
            sheets_context = "\n\n## AVAILABLE GOOGLE SHEETS\n\nYou have access to the following Google Sheets. Use the find_in_google_sheet tool to search them:\n\n"
            for idx, sheet in enumerate(request.google_sheets, 1):
                sheets_context += f"{idx}. Spreadsheet ID: `{sheet.spreadsheet_id}`"
                if sheet.sheet_name:
                    sheets_context += f" (Sheet: {sheet.sheet_name})"
                sheets_context += "\n"
            sheets_context += "\n**IMPORTANT**: When searching, use ONLY these spreadsheet IDs.\n"
            
            if system_prompt:
                system_prompt = system_prompt + sheets_context
            else:
                system_prompt = sheets_context
        
        if system_prompt or request.model or request.headless != True:
            await agent_manager.reinitialize_agent(
                instructions=system_prompt,
                model=request.model,
                headless=request.headless
            )
        
        agent = await agent_manager.get_agent()
        
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.messages
        ]
        
        # Context window management
        total_chars = sum(len(m.get("content", "")) for m in messages)
        estimated_tokens = total_chars // 4
        
        if estimated_tokens > config.CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD:
            messages = await context_manager.summarize_conversation_history(messages)
        elif len(messages) > 10:
            messages = messages[-10:]
        
        # Add structured output instruction
        schema_str = json.dumps(request.structured_output_format, indent=2)
        structured_instruction = f"\n\nIMPORTANT: You MUST respond with valid JSON matching this exact schema:\n{schema_str}\n\nDo not include any text outside the JSON object."
        
        if messages and messages[-1]["role"] == "user":
            messages[-1]["content"] += structured_instruction
        
        print(f"\n[STRUCTURED OUTPUT REQUEST] Schema: {json.dumps(request.structured_output_format)[:200]}\n")
        
        result = await agent.ainvoke({"messages": messages})
        response_content = result["messages"][-1].content
        
        try:
            import re
            json_match = re.search(r'\{.*\}', response_content, re.DOTALL)
            if json_match:
                structured_data = json.loads(json_match.group(0))
            else:
                structured_data = json.loads(response_content)
            
            return {
                "data": structured_data,
                "raw_response": response_content,
                "success": True
            }
        except json.JSONDecodeError as e:
            return {
                "data": None,
                "raw_response": response_content,
                "success": False,
                "error": f"Failed to parse JSON: {str(e)}"
            }
    
    except Exception as e:
        import traceback
        print(f"Error in structured_chat: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for real-time chat"""
    await websocket.accept()
    
    try:
        agent = await agent_manager.get_agent()
        
        while True:
            data = await websocket.receive_json()
            messages = data.get("messages", [])
            
            async for chunk in agent.astream({"messages": messages}, stream_mode="values"):
                if "messages" in chunk and chunk["messages"]:
                    last_message = chunk["messages"][-1]
                    if hasattr(last_message, 'content'):
                        await websocket.send_json({
                            "type": "message",
                            "content": str(last_message.content),
                            "done": False
                        })
            
            await websocket.send_json({
                "type": "message",
                "content": "",
                "done": True
            })
    
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "content": str(e)
        })
        await websocket.close()

@app.get("/api/config")
async def get_config():
    return {
        "model": config.MODEL,
        "mcp_config": agent_manager.mcp_config_manager.config,
        "custom_tools_dir": config.CUSTOM_TOOLS_DIR,
        "context_management": {
            "summarizer_model": config.SUMMARIZER_MODEL,
            "tool_response_summarize_threshold": config.TOOL_RESPONSE_SUMMARIZE_THRESHOLD,
            "conversation_summarize_token_threshold": config.CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD,
            "conversation_keep_recent_messages": config.CONVERSATION_KEEP_RECENT_MESSAGES,
        },
        "mcp_truncation_limits": {
            "max_response_size": config.MCP_MAX_RESPONSE_SIZE,
            "max_string_length": config.MCP_MAX_STRING_LENGTH,
            "max_list_items": config.MCP_MAX_LIST_ITEMS
        }
    }

@app.post("/api/config")
async def update_config(request: ConfigRequest):
    try:
        await agent_manager.reinitialize_agent(
            instructions=request.instructions,
            headless=request.headless
        )
        return {"status": "success", "message": "Agent reinitialized"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mcp/servers")
async def get_mcp_servers():
    return agent_manager.mcp_config_manager.config.get("mcp_servers", {})

@app.post("/api/mcp/servers/{server_name}")
async def add_mcp_server(server_name: str, server_config: MCPServerConfig):
    try:
        current_config = agent_manager.mcp_config_manager.config
        if "mcp_servers" not in current_config:
            current_config["mcp_servers"] = {}
        
        current_config["mcp_servers"][server_name] = {
            "command": server_config.command,
            "args": server_config.args,
            "env": server_config.env or {},
            "enabled": server_config.enabled
        }
        
        agent_manager.mcp_config_manager.save_config(current_config)
        
        if server_config.enabled:
            await agent_manager.reinitialize_agent()
        
        return {"status": "success", "message": f"MCP server '{server_name}' configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/mcp/servers/{server_name}")
async def delete_mcp_server(server_name: str):
    try:
        current_config = agent_manager.mcp_config_manager.config
        if "mcp_servers" in current_config and server_name in current_config["mcp_servers"]:
            del current_config["mcp_servers"][server_name]
            agent_manager.mcp_config_manager.save_config(current_config)
            await agent_manager.reinitialize_agent()
            return {"status": "success", "message": f"MCP server '{server_name}' deleted"}
        else:
            raise HTTPException(status_code=404, detail="Server not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tools")
async def list_tools():
    agent = await agent_manager.get_agent()
    tools_info = []
    for t in agent.tools:
        tools_info.append({
            "name": t.name,
            "description": t.description,
        })
    return {"tools": tools_info}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "agent_initialized": agent_manager.agent is not None,
        "model": config.MODEL,
        "context_management": {
            "summarizer_model": config.SUMMARIZER_MODEL,
            "tool_response_summarize_threshold": config.TOOL_RESPONSE_SUMMARIZE_THRESHOLD,
            "conversation_summarize_token_threshold": config.CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD,
        },
        "mcp_truncation_limits": {
            "max_response_size": config.MCP_MAX_RESPONSE_SIZE,
            "max_string_length": config.MCP_MAX_STRING_LENGTH,
            "max_list_items": config.MCP_MAX_LIST_ITEMS
        }
    }

# Google Sheets OAuth endpoints (conditional)
if GOOGLE_SHEETS_ENABLED and sheets_auth:
    @app.get("/oauth2callback")
    async def oauth2callback(code: str):
        try:
            sheets_auth.handle_callback(code)
            return RedirectResponse(url="http://13.203.61.74:7860")
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.get("/api/sheets/status")
    async def sheets_auth_status():
        return {
            "enabled": GOOGLE_SHEETS_ENABLED,
            "authenticated": sheets_auth.is_authenticated() if sheets_auth else False
        }

    @app.get("/api/sheets/auth-url")
    async def get_sheets_auth_url():
        if not sheets_auth:
            raise HTTPException(status_code=503, detail="Google Sheets not configured")
        auth_url = sheets_auth.get_auth_url()
        if not auth_url:
            raise HTTPException(status_code=503, detail="Cannot generate auth URL")
        return {"auth_url": auth_url}

# ============================================================================
# STARTUP
# ============================================================================

@app.on_event("startup")
async def startup_event():
    print("Initializing DeepAgent server...")
    print(f"Context Window Management:")
    print(f"  - Summarizer model: {config.SUMMARIZER_MODEL} (ChatGPT)")
    print(f"  - Tool response summarize threshold: {config.TOOL_RESPONSE_SUMMARIZE_THRESHOLD:,} chars")
    print(f"  - Conversation summarize threshold: {config.CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD:,} tokens")
    print(f"  - Keep recent messages: {config.CONVERSATION_KEEP_RECENT_MESSAGES}")
    print(f"MCP Truncation Limits:")
    print(f"  - MAX_RESPONSE_SIZE: {config.MCP_MAX_RESPONSE_SIZE:,} chars")
    print(f"  - MAX_STRING_LENGTH: {config.MCP_MAX_STRING_LENGTH:,} chars")
    print(f"  - MAX_LIST_ITEMS: {config.MCP_MAX_LIST_ITEMS} items")
    await agent_manager.initialize_agent()
    print("Server ready!")

if __name__ == "__main__":
    import uvicorn
    
    print(f"""
DeepAgent Server v2.0 (CONTEXT WINDOW MANAGEMENT)
--------------------------------------------------
Features:
- Free web search with DuckDuckGo
- Deep research with specialized agents
- MCP server support (dynamic tools)
- Custom tools integration
- Streaming responses
- Headless browser control
- Web UI for easy interaction

CONTEXT WINDOW MANAGEMENT (ChatGPT-powered):
- Tool response summarization: {config.SUMMARIZER_MODEL}
- Threshold: >{config.TOOL_RESPONSE_SUMMARIZE_THRESHOLD:,} chars
- Conversation summarization: >{config.CONVERSATION_SUMMARIZE_TOKEN_THRESHOLD:,} tokens
- Keep recent: {config.CONVERSATION_KEEP_RECENT_MESSAGES} messages

MCP TRUNCATION LIMITS:
- MAX_RESPONSE_SIZE: {config.MCP_MAX_RESPONSE_SIZE:,} chars
- MAX_STRING_LENGTH: {config.MCP_MAX_STRING_LENGTH:,} chars
- MAX_LIST_ITEMS:    {config.MCP_MAX_LIST_ITEMS} items

Starting on: http://{config.HOST}:{config.PORT}
""")
    
    uvicorn.run(
        "server:app",
        host=config.HOST,
        port=config.PORT,
        reload=True
    )