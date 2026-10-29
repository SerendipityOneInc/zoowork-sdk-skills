"""Asks the Agent for a short analysis of this quarter's sales."""

import asyncio
import os
from zoowork import ZooworkClient, assistant_text, is_run_finished


async def main() -> None:
    agent_id = os.environ.get("ZOOWORK_AGENT_ID")
    if not agent_id:
        raise SystemExit("Set ZOOWORK_AGENT_ID (run python agent_setup.py first)")

    async with ZooworkClient() as client:
        session = await client.create_session(
            agent_id,
            {
                "initial_events": [
                    {
                        "type": "user.message",
                        "content": "Read /workspace/sales.csv and summarize revenue by region in three bullet points.",
                    }
                ]
            },
        )
        async for event in client.stream_events(agent_id, session["session_id"]):
            text = assistant_text(event)
            if text:
                print(text)
            if is_run_finished(event):
                break


if __name__ == "__main__":
    asyncio.run(main())
