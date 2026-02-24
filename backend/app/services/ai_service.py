"""
AI service — wraps Anthropic Claude for spreadsheet intelligence features:
  - Natural language → formula generation
  - Data analysis & insights
  - Natural language queries on sheet data
  - Formula explanation
  - Column/cell value suggestions
"""
from typing import Any
import anthropic
from app.config import get_settings

settings = get_settings()

_SYSTEM_PROMPT = """You are an AI assistant embedded in Nexus Grid, an AI-powered spreadsheet application.
You help users with:
- Converting natural language descriptions into spreadsheet formulas (Excel/Google Sheets compatible syntax)
- Analysing spreadsheet data and providing insights
- Answering questions about the data in natural language
- Explaining existing formulas in plain language
- Suggesting values or patterns based on existing data

Always be concise and precise. When generating formulas, output ONLY the formula starting with '='.
When providing analysis, use bullet points and be specific with numbers.
"""


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


async def generate_formula(description: str, context: str | None = None) -> str:
    """Convert a natural language description into a spreadsheet formula."""
    user_message = f"Generate a spreadsheet formula for: {description}"
    if context:
        user_message += f"\n\nContext about the spreadsheet:\n{context}"

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    return message.content[0].text.strip()


async def explain_formula(formula: str) -> str:
    """Explain what a spreadsheet formula does in plain language."""
    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Explain this spreadsheet formula in plain English:\n{formula}",
            }
        ],
    )
    return message.content[0].text.strip()


async def analyze_data(data: list[list[Any]], question: str | None = None) -> str:
    """Analyze spreadsheet data and answer an optional question or provide general insights."""
    # Build a compact CSV-like representation (max 200 rows to stay within token budget)
    rows = data[:200]
    csv_preview = "\n".join(",".join(str(c) for c in row) for row in rows)

    prompt = (
        f"Here is spreadsheet data (CSV format):\n\n{csv_preview}\n\n"
        + (f"Question: {question}" if question else "Provide key insights about this data.")
    )

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


async def suggest_values(column_name: str, existing_values: list[str], count: int = 5) -> list[str]:
    """Suggest likely next values for a column based on its existing values."""
    sample = existing_values[-20:] if len(existing_values) > 20 else existing_values
    prompt = (
        f"Column '{column_name}' has these existing values:\n"
        + "\n".join(f"- {v}" for v in sample)
        + f"\n\nSuggest {count} likely next values. Return ONLY a JSON array of strings, nothing else."
    )

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    text = message.content[0].text.strip()
    try:
        suggestions = json.loads(text)
        return suggestions[:count] if isinstance(suggestions, list) else []
    except json.JSONDecodeError:
        return []


async def natural_language_query(data: list[list[Any]], query: str) -> str:
    """Answer a natural language question about spreadsheet data."""
    rows = data[:500]
    csv_preview = "\n".join(",".join(str(c) for c in row) for row in rows)

    prompt = (
        f"Spreadsheet data:\n\n{csv_preview}\n\n"
        f"User query: {query}\n\n"
        "Answer the query based on the data. Be precise and cite specific values where relevant."
    )

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()
