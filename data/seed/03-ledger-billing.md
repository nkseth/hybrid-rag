# Ledger Billing Service

Ledger is the billing service for Flightpath. It is owned by the Platform team and its technical lead is Marco Silva.

Ledger stores invoices in PostgreSQL and publishes invoice events to Kafka. The Data team consumes these Kafka events to build revenue dashboards.

Ledger depends on the Atlas API gateway for authentication. Every request to Ledger is authenticated by Atlas before it reaches the service.

Ledger runs the monthly billing job on the first day of each month at 02:00 UTC. The job usually completes in about 40 minutes.

Pricing: Flightpath charges 18 euros per van per month, with a 10% discount for fleets above 500 vans.
