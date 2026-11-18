# Security Policy

All secrets at Kestrel Dynamics are stored in HashiCorp Vault. Secrets must never be committed to Git repositories.

Database credentials rotate every 30 days. TLS certificates rotate automatically every 60 days through Vault since the March 2026 incident.

Access to production requires single sign-on and a hardware security key. Production access reviews happen every quarter and are run by Hana Sato, the security champion on the Platform team.

Security incidents must be reported in the #security-incidents channel within one hour of discovery.
