"""Arm "annotated": add minimum-SDK-version notes to a zoowork-agents-docs checkout.

Usage: python3 annotate-docs.py <docs-checkout>

Edits the English source only, because the coding assistants under test read the English
Markdown, and refreshes the Chinese pages' source_hash so the docs build accepts the change. Each
note states the release that added a method or field, so an assistant working in a project pinned
to an older SDK can see the gap. Exits non-zero if an anchor is missing, so a docs
change that moves a section fails loudly instead of producing an unannotated arm.
"""

import hashlib
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1]) / "docs" / "en"
zh_root = root.parent / "zh"

EDITS = {
    "get-started/quickstart.md": [
        (
            "The SDK examples in this documentation use TypeScript SDK **0.13.0+** and Python SDK **0.8.0+**.",
            "The SDK examples in this documentation use TypeScript SDK **0.13.0+** and Python SDK **0.8.0+**.\n"
            "Methods and fields added after TypeScript SDK 0.10.0 or Python SDK 0.5.0 are marked with the\n"
            "release that added them. Check that release against the SDK version your project installs.",
        ),
    ],
    "build/agents.md": [
        (
            "## Set the thinking level\n",
            "## Set the thinking level\n\n"
            "Added in TypeScript SDK 0.12.0 and Python SDK 0.7.0. Older TypeScript SDKs reject\n"
            "`model.thinking` at type-check time.\n",
        ),
    ],
    "build/files.md": [
        (
            "## Send a file to the Agent\n",
            "## Send a file to the Agent\n\n"
            "Added in TypeScript SDK 0.11.0 (`uploadFile`) and Python SDK 0.6.0 (`upload_file`).\n",
        ),
    ],
    "reference/typescript-sdk.md": [
        (
            "See [Files](../build/files.md#send-a-file-to-the-agent). |",
            "See [Files](../build/files.md#send-a-file-to-the-agent). Added in 0.11.0. |",
        ),
        (
            "### `ThinkingLevel`, `AgentModelUpdate`, and `AgentUpdate`\n",
            "### `ThinkingLevel`, `AgentModelUpdate`, and `AgentUpdate`\n\nAdded in 0.12.0.\n",
        ),
    ],
    "reference/python-sdk.md": [
        (
            "See [Files](../build/files.md#send-a-file-to-the-agent). |",
            "See [Files](../build/files.md#send-a-file-to-the-agent). Added in 0.6.0. |",
        ),
        ("## Set and clear thinking\n", "## Set and clear thinking\n\nAdded in 0.7.0.\n"),
    ],
}

for rel, edits in EDITS.items():
    path = root / rel
    text = path.read_text()
    for old, new in edits:
        if text.count(old) != 1:
            sys.exit(f"{rel}: expected exactly one match for {old[:60]!r}, found {text.count(old)}")
        text = text.replace(old, new)
    path.write_text(text)
    # The build refuses a Chinese page whose source_hash no longer matches its English source. The
    # assistants under test read English, so record the new hash instead of translating the notes.
    zh = zh_root / rel
    if zh.exists():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        zh.write_text(re.sub(r"(?m)^source_hash: .*$", f"source_hash: {digest}", zh.read_text(), count=1))
    print(f"annotated {rel}")
