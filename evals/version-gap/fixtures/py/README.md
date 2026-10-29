# sales-insights

Asks a ZooWork Agent to analyze `data/sales.csv`.

    python -m venv .venv && .venv/bin/pip install -r requirements.txt
    export ZOOWORK_API_KEY=...        # Platform Project key
    .venv/bin/python agent_setup.py   # once; save the printed ID
    export ZOOWORK_AGENT_ID=agt_...
    .venv/bin/python analyze.py
