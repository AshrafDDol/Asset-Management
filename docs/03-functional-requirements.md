# Functional Requirements

## Overview

This document defines what the Evolve Inventory Management system must do. The requirements are grouped by module and user role to guide system development, testing, and acceptance.

## User Role Matrix

| Role | Main Responsibility | Access Level |
| --- | --- | --- |
| Admin | Manage users, roles, settings, and all assets | Full access |
| Store/Inventory Staff | Register assets and manage inventory movements | Asset registration, movement, return, search, reporting |
| IT Staff | Manage computer devices and peripherals | Register, update, assign, transfer, and search IT assets |
| Auditor | Perform asset verification and stock take | Audit, scan, verify, and view audit reports |
| Department User | View assets assigned to their department or themselves | View-only access to assigned assets |

## Module List

The system will include the following modules:

- Dashboard
- Asset Registration
- RFID Tag Management
- Asset Search
- Assignment
- Transfer/Movement
- Return
- Audit/Stock Take
- Disposal
- User Management
- Report

## Dashboard

### Requirement

The web dashboard must provide a summary of asset information and operational status.

### Functions

- Show total assets.
- Show assets by status.
- Show assets by category.
- Show assets by department.
- Show assets by location.
- Show recent asset movements.
- Show pending audit or stock take summary.
- Show disposed, repaired, or missing asset summary.

## Asset Registration

### Requirement

Authorized users must be able to create new asset records.

### Functions

- Create asset.
- Generate or enter asset code.
- Enter item name, category, brand, model, and serial number.
- Enter RFID EPC, barcode, or QR code when available.
- Enter purchase date and warranty expiry.
- Select department, location, custodian, status, and condition.
- Add remarks.
- Save asset record.

### Validation

- Asset code must be unique.
- Serial number should be unique when required by company policy.
- RFID EPC must be unique when linked to an active asset.
- Required fields must be completed before saving.

## Update Asset Information

### Requirement

Authorized users must be able to update asset master data.

### Functions

- Edit asset details.
- Update category, brand, model, or serial number.
- Update department, location, custodian, status, or condition.
- Update remarks.
- Save update history.

### Validation

- User must have permission to update assets.
- Asset identity fields should be protected from accidental duplicate values.
- System should keep record of important changes.

## RFID Tag Management

### Requirement

The system must support RFID tag assignment and linking between RFID EPC and asset record.

### Functions

- Scan RFID tag.
- Enter RFID EPC manually if needed.
- Encode RFID tag when supported by the device integration layer.
- Link RFID EPC to asset.
- Replace RFID tag.
- Unlink RFID tag from asset when required.
- View RFID tag assignment history.

### Validation

- RFID EPC must be unique.
- RFID EPC cannot be linked to more than one active asset.
- Asset must exist before RFID linking.

## Handheld Asset Scanning

### Requirement

Users must be able to scan assets using a handheld RFID device.

### Functions

- Login from handheld app.
- Open main menu.
- Scan RFID asset.
- View scanned asset details.
- Transfer scanned asset.
- Add scanned asset to audit session.
- Submit scan result.

### Validation

- User must be authenticated before scanning.
- Unknown RFID EPC should show as unregistered or not found.
- Scan results must sync with backend API.

## Check In and Check Out

### Requirement

The system must support checking assets out to users or departments and checking them back in.

### Functions

- Check out asset to custodian, staff, or department.
- Record check-out date.
- Check in returned asset.
- Record return date.
- Update asset status.
- Save assignment history.

### Validation

- Asset must be active and available before check-out.
- Returned asset condition should be recorded.
- Check-in and check-out transactions must be stored.

## Transfer and Movement

### Requirement

The system must allow assets to be transferred between locations.

### Functions

- Search or scan asset.
- Select destination location.
- Enter movement reason.
- Confirm transfer.
- Update current location.
- Store transfer history.

### Validation

- Asset must exist.
- Destination location must be valid.
- Movement must be recorded with user and timestamp.

## Asset Details

### Requirement

Users must be able to view full asset information.

### Functions

- View asset identity details.
- View RFID EPC, barcode, or QR code.
- View category, brand, model, and serial number.
- View department, location, custodian, status, and condition.
- View purchase date and warranty expiry.
- View movement history.
- View audit history.
- View repair or disposal history.

## Asset Search

### Requirement

Users must be able to quickly find assets using common identifiers.

### Search Criteria

- Asset code
- RFID EPC
- Serial number
- Barcode
- QR code
- Item name
- Category
- Department
- Location
- Custodian
- Status

## Audit and Stock Take

### Requirement

Auditors and authorized staff must be able to perform asset verification.

### Functions

- Create audit or stock take session.
- Select location, department, or asset group for audit.
- Scan assets using handheld device.
- Compare scanned assets with expected asset list.
- Mark asset as found, missing, wrong location, unexpected, or damaged.
- Submit audit result.
- Generate audit report.

### Validation

- Audit session must have a defined scope.
- Each scan must be recorded with user, timestamp, and location when available.
- Audit result must be stored for reporting and follow-up.

## Disposal

### Requirement

The system must support disposal of assets that are no longer active.

### Functions

- Select asset for disposal.
- Enter disposal reason.
- Update status to disposed.
- Record disposal date and user.
- Keep disposal history.

### Validation

- Only authorized users can dispose assets.
- Disposed assets cannot be checked out or transferred as active assets.
- Disposal records must remain searchable for audit.

## User Management

### Requirement

Admins must be able to manage user credentials and roles.

### Functions

- Create user account.
- Update user details.
- Assign role.
- Activate or deactivate user.
- Reset password or manage authentication flow.
- View user activity when required.

### Validation

- Only Admin users can manage user accounts.
- Each user must have a unique login identifier.
- Deactivated users cannot access the system.

## Reports

### Requirement

The system must generate operational and management reports.

### Report Types

- Asset list report.
- Asset by category report.
- Asset by location report.
- Asset by department report.
- Asset by custodian report.
- Movement history report.
- Audit or stock take report.
- Missing asset report.
- Disposed asset report.
- Warranty expiry report.

### Export

Reports should support export to common formats such as Excel, CSV, or PDF, depending on final implementation decisions.

## Non-Functional Requirements

- The system should require login for all protected functions.
- Role-based access control must be applied.
- Asset search should return results quickly.
- Important transactions should be auditable.
- The handheld app should handle temporary connection issues where practical.
- The backend API should validate all submitted data.
- The system should protect data from unauthorized access.
- The web application should be usable on common desktop browsers.
- The handheld application should be optimized for scanning workflows.
