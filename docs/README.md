# Evolve Inventory Management Documentation

This folder contains the planning documents for the Evolve Inventory Management system before development starts.

## Document List

1. [Project Overview](./01-project-overview.md)
2. [Business Flow](./02-business-flow.md)
3. [Functional Requirements](./03-functional-requirements.md)
4. [Data Design](./04-data-design.md)
5. [System Design](./05-system-design.md)
6. [System Architecture](./06-system-architecture.md)

## System Summary

Evolve Inventory Management is a web and handheld-based asset tracking system for managing company assets and devices. The system supports RFID tag assignment, asset registration, location movement, staff or department assignment, stock take, auditing, disposal, and reporting.

The proposed solution includes:

- React web frontend for dashboard, administration, registration, reporting, and asset management.
- React Native handheld frontend for RFID scanning, asset viewing, movement, and audit operations.
- Node.js backend API for business logic, authentication, asset workflows, and integration.
- Database for master data, transactional records, audit history, user roles, and RFID tag mapping.
- RFID device integration layer for handheld scanning and tag encoding.
- Authentication and role-based access control.
- Reporting and export features for operational and audit use.
