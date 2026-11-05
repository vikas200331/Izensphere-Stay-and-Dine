import json
import os
import frappe

def import_all():
	"""Import data fixtures into the current site."""
	fixtures_dir = "/apps/frappe-bench/apps/kamra/data/fixtures"
	if not os.path.exists(fixtures_dir):
		# Fallback to relative path
		fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "fixtures"))

	doctypes_order = [
		("Property", "property.json"),
		("Property Setting", "property_setting.json"),
		("Room Type", "room_type.json"),
		("Room Type Media", "room_type_media.json"),
		("Room", "room.json"),
		("Rate Plan", "rate_plan.json"),
		("POS Outlet", "pos_outlet.json"),
		("Menu Item", "menu_item.json"),
		("Ingredient", "ingredient.json"),
		("Lost And Found Item", "lost_and_found_item.json"),
		("Vendor", "vendor.json"),
		("Transaction Code", "transaction_code.json"),
		("Reason Code", "reason_code.json"),
	]

	for dt, filename in doctypes_order:
		path = os.path.join(fixtures_dir, filename)
		if not os.path.exists(path):
			continue
		with open(path, "r", encoding="utf-8") as f:
			records = json.load(f)
		imported = 0
		for rec in records:
			name = rec.get("name")
			if not name:
				continue
			if frappe.db.exists(dt, name):
				doc = frappe.get_doc(dt, name)
				doc.update(rec)
				doc.save(ignore_permissions=True)
			else:
				doc = frappe.get_doc(rec)
				doc.insert(ignore_permissions=True)
			imported += 1
		frappe.db.commit()
		print(f"Imported/updated {imported} records for {dt}")

