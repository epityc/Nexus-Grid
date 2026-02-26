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


async def clean_and_import_csv(csv_text: str, instruction: str) -> tuple[list[list[str]], str]:
    """
    Use Claude to clean/transform tabular data according to user instruction.
    Returns (cleaned 2D grid, human-readable summary).
    """
    prompt = (
        f"Voici des données tabulaires (CSV) :\n\n{csv_text[:8000]}\n\n"
        f"Instruction : {instruction}\n\n"
        "Réponds en JSON avec exactement ce format :\n"
        '{"summary": "...", "data": [["col1", "col2"], ["val1", "val2"]]}\n'
        "- data : tableau 2D de chaînes (première ligne = en-têtes)\n"
        "- summary : une phrase décrivant ce qui a été fait\n"
        "N'écris rien d'autre que ce JSON."
    )

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    text = response.content[0].text.strip()
    # Strip potential markdown code fences
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    parsed = json.loads(text)
    data: list[list[str]] = parsed.get("data", [])
    summary: str = parsed.get("summary", "Import effectué.")
    return data, summary


async def chat_with_files(message: str, file_contexts: list[str]) -> str:
    """Answer a user message using uploaded file contents as context."""
    if file_contexts:
        context_block = "\n\n".join(
            f"--- Fichier {i + 1} ---\n{ctx[:4000]}"
            for i, ctx in enumerate(file_contexts)
        )
        prompt = (
            f"Voici le contenu des fichiers chargés en mémoire :\n\n{context_block}"
            f"\n\n---\nInstruction de l'utilisateur : {message}"
        )
    else:
        prompt = message

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


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
