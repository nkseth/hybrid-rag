# Routing and Data Teams

The Routing team is led by Diego Fernandes. It owns the Flightpath route planner, which uses a vehicle routing solver built on Google OR-Tools. The route planner recomputes plans every 15 minutes when traffic data changes.

The Data team is led by Lena Kowalski. It owns the Prism analytics warehouse, built on DuckDB and dbt. Prism ingests Kafka events from Ledger and GPS pings from vans.

The Routing team uses forecasts from the Data team to estimate delivery times. The Data team's demand forecast model is retrained every Sunday night.
