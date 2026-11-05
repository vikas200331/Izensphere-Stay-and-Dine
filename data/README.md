# Izensphere Stay and Dine — Data & Database Exports

This directory contains the complete operational data, database backups, fixtures, and media assets for **Izensphere Stay and Dine**.

---

## Directory Structure

```
data/
├── database/
│   ├── demo_site_database.sql.gz    # Complete site MariaDB backup (all tables & schemas)
│   ├── kamra_app_tables.sql         # Standalone SQL dump of all 119 Izensphere/Kamra tables
│   └── kamra_app_tables.sql.gz      # Compressed SQL dump of all Kamra tables
├── fixtures/                        # Clean JSON fixtures for core operational records
│   ├── property.json                # Properties (Stay and Dine, Beach Homestay, etc.)
│   ├── property_setting.json        # Check-in/out policies, tax rules, currency
│   ├── room_type.json               # Room categories (Standard, Deluxe, Suite, etc.)
│   ├── room_type_media.json         # Room photo galleries and showcase images
│   ├── room.json                    # All physical rooms across properties
│   ├── rate_plan.json               # Rate plans and tariffs
│   ├── pos_outlet.json              # Outlets (Main Restaurant, Bar, Room Service)
│   ├── menu_item.json               # Complete F&B menu dishes with prices
│   ├── ingredient.json              # Kitchen store cupboard & ingredients
│   ├── lost_and_found_item.json     # Housekeeping Lost & Found registers
│   ├── vendor.json                  # Vendors and suppliers
│   ├── transaction_code.json        # Financial transaction codes (Code 1000 Room, etc.)
│   └── reason_code.json             # Void, allowance, and adjustment codes
├── files/                           # Uploaded public logos, marks, and web assets
│   ├── izensphere-dine-logo.svg
│   ├── izensphere-stay-and-dine-logo.svg
│   ├── izensphere-dine-favicon.svg
│   ├── izensphere-dine-mark.svg
│   ├── izensphere-app-icon.svg
│   └── restaurant-logo.webp
└── README.md
```

---

## How to Restore

### Option 1: Full Site Database Restore (Recommended for Fresh Bench)
To restore the entire site database with all records, users, and schemas:

```bash
bench --site <your-site-name> --force restore data/database/demo_site_database.sql.gz
bench --site <your-site-name> migrate
bench --site <your-site-name> clear-cache
```

### Option 2: Restore Kamra Tables into an Existing Site
If you already have a running Frappe/ERPNext site and just want the Izensphere Stay and Dine tables:

```bash
bench --site <your-site-name> mariadb < data/database/kamra_app_tables.sql
bench --site <your-site-name> migrate
bench --site <your-site-name> clear-cache
```

### Option 3: Import JSON Fixtures via Bench Python
To import or update master records (properties, rooms, rate plans, menu, ingredients, lost & found):

```bash
bench --site <your-site-name> execute kamra.scripts.import_data_fixtures.import_all
```

---

## Media Files
To link the branding assets to your site's public files:

```bash
cp data/files/* sites/<your-site-name>/public/files/
```
