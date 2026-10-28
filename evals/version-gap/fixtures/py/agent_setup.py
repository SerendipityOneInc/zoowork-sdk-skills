"""One-time setup: creates the ZooWork Agent this app uses and prints its ID."""

import asyncio

from zoowork import ZooworkClient


async def main() -> None:
    async with ZooworkClient() as client:
        models = await client.list_models()
        primary = next(
            model["model"]
            for model in models
            if model.get("selectable") is not False and "model" in (model.get("default_for") or [])
        )
        agent = await client.create_agent(
            {"name": "sales-insights", "model": {"primary": primary}},
            idempotency_key="sales-insights-setup-v1",
        )
        print(agent["agent_id"])


if __name__ == "__main__":
    asyncio.run(main())
