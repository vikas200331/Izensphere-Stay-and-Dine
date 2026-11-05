import json
import frappe

def export_all():
	doctypes_to_export = [
		"Property",
		"Property Setting",
		"Room Type",
		"Room Type Media",
		"Room",
		"Rate Plan",
		"POS Outlet",
		"Menu Item",
		"Ingredient",
		"Lost And Found Item",
		"Vendor",
		"Transaction Code",
		"Reason Code",
	]

	for dt in doctypes_to_export:
		names = frappe.get_all(dt, pluck="name")
		records = []
		for n in names:
			doc = frappe.get_doc(dt, n)
			records.append(doc.as_dict())
		clean_name = dt.lower().replace(" ", "_")
		filename = f"/apps/frappe-bench/apps/kamra/data/fixtures/{clean_name}.json"
		with open(filename, "w", encoding="utf-8") as f:
			json.dump(records, f, indent=2, default=str)
		print(f"Exported {len(records)} records for {dt} -> {filename}")

