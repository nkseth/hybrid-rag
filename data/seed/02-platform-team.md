# Platform Team Charter

The Platform team is led by Priya Raman. It owns shared infrastructure that every other team depends on.

The Platform team owns two production services: the Atlas API gateway and the Ledger billing service. Atlas handles authentication, rate limiting, and request routing for all public APIs. Ledger calculates monthly invoices for Flightpath customers.

The Platform team also maintains Orion, the internal CI/CD system. Orion runs every pull request through unit tests, integration tests, and a canary deploy before production.

On-call for Platform rotates weekly between Priya Raman, Marco Silva, and Hana Sato. Escalations go to Tomas Lindqvist.
