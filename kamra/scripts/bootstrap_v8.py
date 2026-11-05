"""Schema v8 — the operational long tail:

- Travel Agent (business source with commission %) + Reservation link
- Venue + Venue Booking (banquets/events, enquiry→confirmed pipeline)
- Multi-currency folio payments (currency + fx rate, INR ledger value)
- Lost & Found register
- Shift Handover (cash count, handover chain)

Run via bench console:
    from kamra.scripts.bootstrap_v8 import execute; execute()
"""

import frappe

from kamra.scripts.bootstrap_schema import _dt, f
from kamra.scripts.bootstrap_v5 import add_fields
from kamra.scripts.fix_perms_fields import _grant

# role -> (read, write, create) per new doctype
PERMS = {
	"Travel Agent": {
		"System Manager": (1, 1, 1), "Hotel Admin": (1, 1, 1),
		"Revenue Manager": (1, 1, 1), "Front Desk": (1, 0, 0),
		"Finance": (1, 0, 0), "Kamra Agent": (1, 0, 0),
	},
	"Venue": {
		"System Manager": (1, 1, 1), "Hotel Admin": (1, 1, 1),
		"Revenue Manager": (1, 1, 1), "Front Desk": (1, 0, 0),
		"Kamra Agent": (1, 0, 0),
	},
	"Venue Booking": {
		"System Manager": (1, 1, 1), "Hotel Admin": (1, 1, 1),
		"Front Desk": (1, 1, 1), "Finance": (1, 0, 0),
		"Kamra Agent": (1, 1, 1),
	},
	"Lost And Found Item": {
		"System Manager": (1, 1, 1), "Hotel Admin": (1, 1, 1),
		"Front Desk": (1, 1, 1), "Kamra Agent": (1, 1, 1),
	},
	"Shift Handover": {
		"System Manager": (1, 1, 1), "Hotel Admin": (1, 1, 1),
		"Front Desk": (1, 1, 1), "Finance": (1, 0, 0),
	},
}


def execute():
	# ── Travel Agent / business source ──────────────────────────────────
	_dt("Travel Agent", [
		f("agent_name", "Data", reqd=1, unique=1, in_list_view=1),
		f("agent_type", "Select", options="Travel Agent\nOTA\nTour Operator\nCorporate Desk",
		  default="Travel Agent", in_list_view=1),
		f("column_break_a", "Column Break"),
		f("commission_pct", "Percent", label="Commission %", in_list_view=1),
		f("contact_name", "Data"),
		f("contact_phone", "Data", options="Phone"),
		f("contact_email", "Data", options="Email"),
		f("disabled", "Check"),
	], autoname="field:agent_name", naming_rule="By fieldname")

	add_fields("Reservation", [
		dict(fieldname="travel_agent", fieldtype="Link", options="Travel Agent",
		     label="Travel Agent", insert_after="channel"),
		dict(fieldname="commission_amount", fieldtype="Currency",
		     label="Agent Commission", read_only=1,
		     insert_after="travel_agent"),
		# booker vs guest: an assistant/PA/travel desk booking for a VIP.
		# `guest` stays the person sleeping in the room (profile, journey,
		# VIP flag); these fields record who arranged it and who to call.
		dict(fieldname="sb_booker", fieldtype="Section Break",
		     label="Booked By (if not the guest)",
		     insert_after="commission_amount"),
		dict(fieldname="booked_by_name", fieldtype="Data",
		     label="Booker Name", insert_after="sb_booker"),
		dict(fieldname="booked_by_phone", fieldtype="Data",
		     label="Booker Phone", insert_after="booked_by_name"),
		dict(fieldname="booker_relation", fieldtype="Select",
		     options="\nAssistant\nFamily\nCompany Travel Desk\nTravel Agent\nOther",
		     label="Relation", insert_after="booked_by_phone"),
		dict(fieldname="contact_preference", fieldtype="Select",
		     options="Guest\nBooker\nBoth", default="Guest",
		     label="Contact For This Stay",
		     insert_after="booker_relation",
		     description="Who the hotel (and agents) should message about this stay"),
	])

	# ── Venues (banquets / events) ───────────────────────────────────────
	_dt("Venue", [
		f("property", "Link", options="Property", reqd=1),
		f("venue_name", "Data", reqd=1, in_list_view=1),
		f("capacity", "Int", in_list_view=1),
		f("column_break_a", "Column Break"),
		f("base_price", "Currency", in_list_view=1,
		  description="Indicative price per event/day"),
		f("amenities", "Small Text"),
		f("disabled", "Check"),
	], autoname="format:{property}-{venue_name}", naming_rule="Expression",
	   title_field="venue_name")

	_dt("Venue Booking", [
		f("property", "Link", options="Property", reqd=1),
		f("venue", "Link", options="Venue", reqd=1, in_list_view=1),
		f("event_type", "Select", in_list_view=1,
		  options="Wedding\nConference\nBirthday\nCorporate Offsite\nOther"),
		f("column_break_a", "Column Break"),
		f("status", "Select", in_list_view=1, in_standard_filter=1,
		  options="Enquiry\nConfirmed\nCompleted\nCancelled",
		  default="Enquiry"),
		f("event_date", "Date", reqd=1, in_list_view=1),
		f("start_time", "Time"),
		f("end_time", "Time"),
		f("sb_who", "Section Break", label="Customer"),
		f("customer_name", "Data", reqd=1, in_list_view=1),
		f("customer_phone", "Data", options="Phone"),
		f("column_break_b", "Column Break"),
		f("company", "Link", options="Corporate Account"),
		f("attendees", "Int"),
		f("sb_money", "Section Break", label="Money"),
		f("quoted_amount", "Currency"),
		f("column_break_c", "Column Break"),
		f("advance_received", "Currency"),
		f("sb_notes", "Section Break", label="Notes"),
		f("requirements", "Small Text",
		  description="Menu, seating, AV, decor…"),
	], naming_rule="Expression", autoname="format:EVT-{YYYY}-{####}",
	   title_field="customer_name")

	# ── Multi-currency payments ──────────────────────────────────────────
	add_fields("Folio Payment", [
		dict(fieldname="currency", fieldtype="Data", label="Currency",
		     default="INR", insert_after="amount"),
		dict(fieldname="fx_amount", fieldtype="Float", label="FX Amount",
		     insert_after="currency",
		     description="Amount in the foreign currency (amount stays the INR ledger value)"),
		dict(fieldname="exchange_rate", fieldtype="Float",
		     label="Exchange Rate", default="1",
		     insert_after="fx_amount"),
	])

	# ── Lost & Found ─────────────────────────────────────────────────────
	_dt("Lost And Found Item", [
		f("property", "Link", options="Property", reqd=1),
		f("item_description", "Data", reqd=1, in_list_view=1),
		f("found_in_room", "Link", options="Room", in_list_view=1),
		f("column_break_a", "Column Break"),
		f("found_on", "Date", reqd=1, in_list_view=1),
		f("found_by", "Data"),
		f("status", "Select", in_list_view=1, in_standard_filter=1,
		  options="In Storage\nReturned\nDisposed", default="In Storage"),
		f("sb_return", "Section Break", label="Return"),
		f("guest", "Link", options="Guest"),
		f("column_break_b", "Column Break"),
		f("returned_on", "Date"),
		f("notes", "Small Text"),
	], naming_rule="Expression", autoname="format:LF-{#####}",
	   title_field="item_description")

	# ── Shift handover / cash ────────────────────────────────────────────
	_dt("Shift Handover", [
		f("property", "Link", options="Property", reqd=1),
		f("shift", "Select", options="Morning\nEvening\nNight", reqd=1,
		  in_list_view=1),
		f("shift_date", "Date", reqd=1, in_list_view=1),
		f("column_break_a", "Column Break"),
		f("status", "Select", options="Open\nClosed", default="Open",
		  in_list_view=1),
		f("handed_over_to", "Link", options="User"),
		f("sb_cash", "Section Break", label="Cash Count"),
		f("opening_cash", "Currency"),
		f("cash_collected", "Currency",
		  description="Cash payments taken this shift (see folio payments)"),
		f("column_break_b", "Column Break"),
		f("payouts", "Currency", description="Cash paid out (vendors, refunds)"),
		f("closing_cash", "Currency", in_list_view=1),
		f("sb_notes", "Section Break", label="Notes"),
		f("handover_notes", "Small Text",
		  description="Pending follow-ups for the next shift"),
	], naming_rule="Expression", autoname="format:SHIFT-{shift_date}-{shift}",
	   title_field="shift")

	for doctype, grants in PERMS.items():
		for role, (r, w, c) in grants.items():
			_grant(doctype, role, r, w, c, delete=1 if role in ("System Manager", "Hotel Admin") else 0)
	print("perms granted for v8 doctypes")

	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- batch/seed/migration script runs outside the request cycle; explicit commit persists the staged writes
	print("Kamra v8 schema (operational long tail) ready.")


def seed_lost_and_found():
	"""Seed comprehensive, realistic Lost & Found register data across properties."""
	items = [
		# ── Izensphere Beach Homestay (5 Rooms) ──
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Apple iPad Air (Space Grey, 64GB) with dark green Smart Folio",
			"condition": "Found",
			"found_in_room": "Izensphere Beach Homestay-Room 2",
			"found_on": "2026-11-04",
			"found_by": "Anita (Housekeeping)",
			"status": "In Storage",
			"guest": "G-00521",
			"notes": "Found on bedside nightstand during departure inspection. Stored in Reception Safe Locker #1.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Ray-Ban Polarized Wayfarer Sunglasses in Brown Leather Case",
			"condition": "Found",
			"found_in_room": "Izensphere Beach Homestay-Room 1",
			"found_on": "2026-11-03",
			"found_by": "Raju (Floor Attendant)",
			"status": "In Storage",
			"guest": "G-00522",
			"notes": "Found on the sea-facing balcony chair. Guest contacted via phone.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Sony WH-1000XM4 Noise Canceling Headphones (Black)",
			"condition": "Found",
			"found_in_room": "Izensphere Beach Homestay-Room 3",
			"found_on": "2026-11-02",
			"found_by": "Lata (Housekeeping Attendant)",
			"status": "Returned",
			"guest": "G-00523",
			"returned_on": "2026-11-03",
			"notes": "Left under desk. Handed back to guest Amit Patel with identity verification.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "GoPro Hero 11 Black with orange floating hand grip",
			"condition": "Found",
			"found_in_room": "Izensphere Beach Homestay-Room 4",
			"found_on": "2026-11-04",
			"found_by": "Suresh (Security / Beach Deck)",
			"status": "In Storage",
			"guest": "G-00524",
			"notes": "Found on poolside table outside Room 4. Logged in manager safe.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Kindle Paperwhite 11th Gen with Blue Fabric Cover",
			"condition": "Found",
			"found_in_room": "Izensphere Beach Homestay-Room 5",
			"found_on": "2026-11-01",
			"found_by": "Kiran (Housekeeping)",
			"status": "In Storage",
			"guest": None,
			"notes": "Found under bed pillows. Stored in Linen Room Locker A.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Diamond Stud Earring (Single)",
			"condition": "Missing",
			"found_in_room": "Izensphere Beach Homestay-Room 1",
			"found_on": "2026-11-04",
			"found_by": "Priya Verma (Guest Report)",
			"status": "In Storage",
			"guest": "G-00522",
			"notes": "Guest reported missing diamond earring after breakfast. Search underway in room and dining patio.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Ceramic Tea Pot with Hand-painted Floral Artwork",
			"condition": "Damaged",
			"found_in_room": "Izensphere Beach Homestay-Room 3",
			"found_on": "2026-11-03",
			"found_by": "Lata (Housekeeping)",
			"status": "Disposed",
			"guest": "G-00523",
			"notes": "Handle broken during guest stay. Replaced from stock and written off.",
		},
		{
			"property": "Izensphere Beach Homestay",
			"item_description": "Leather Passport Wallet with International Driving Permit",
			"condition": "Found",
			"found_in_room": "Izensphere Beach Homestay-Room 2",
			"found_on": "2026-11-04",
			"found_by": "Raju (Floor Attendant)",
			"status": "In Storage",
			"guest": "G-00521",
			"notes": "Found in safe after checkout. Stored in Manager Safe; guest notified via SMS.",
		},

		# ── Izensphere Lakeside Villa ──
		{
			"property": "Izensphere Lakeside Villa",
			"item_description": "MacBook Pro 14-inch Space Black with MagSafe 3 Charger",
			"condition": "Found",
			"found_in_room": "Izensphere Lakeside Villa-Room 2",
			"found_on": "2026-11-04",
			"found_by": "Vikas (Villa Housekeeper)",
			"status": "In Storage",
			"guest": "G-00521",
			"notes": "Found on study table in upper floor suite. Placed in Villa Admin Safe.",
		},
		{
			"property": "Izensphere Lakeside Villa",
			"item_description": "Titan Raga Rose Gold Women Watch",
			"condition": "Found",
			"found_in_room": "Izensphere Lakeside Villa-Room 1",
			"found_on": "2026-11-03",
			"found_by": "Deepa (Housekeeping)",
			"status": "In Storage",
			"guest": "G-00522",
			"notes": "Found on bathroom marble vanity. Stored in front office deposit box.",
		},
		{
			"property": "Izensphere Lakeside Villa",
			"item_description": "Samsonite Cabin Trolley Bag (Navy Blue)",
			"condition": "Found",
			"found_in_room": "Izensphere Lakeside Villa-Room 4",
			"found_on": "2026-11-02",
			"found_by": "Vikas (Housekeeper)",
			"status": "Returned",
			"guest": "G-00524",
			"returned_on": "2026-11-02",
			"notes": "Courier dispatched via Blue Dart per guest request; AWB #384918239.",
		},

		# ── Izensphere Palace & Resort ──
		{
			"property": "Izensphere Palace & Resort",
			"item_description": "Montblanc Meisterstück Fountain Pen (Black & Gold)",
			"condition": "Found",
			"found_in_room": "Izensphere Palace & Resort-101",
			"found_on": "2026-11-04",
			"found_by": "Pooja (Housekeeping)",
			"status": "In Storage",
			"guest": "G-00521",
			"notes": "Found inside executive desk drawer. Stored in Hotel Vault #4.",
		},
		{
			"property": "Izensphere Palace & Resort",
			"item_description": "Apple AirPods Pro (2nd Gen) with MagSafe Charging Case",
			"condition": "Found",
			"found_in_room": "Izensphere Palace & Resort-103",
			"found_on": "2026-11-04",
			"found_by": "Sunil (Captain)",
			"status": "In Storage",
			"guest": "G-00523",
			"notes": "Found under armchair in living area. Guest informed.",
		},

		# ── Izensphere Stay and Dine ──
		{
			"property": "Izensphere Stay and Dine",
			"item_description": "Apple Watch Ultra 2 with Orange Alpine Loop",
			"condition": "Found",
			"found_in_room": "Izensphere Dine-101",
			"found_on": "2026-11-04",
			"found_by": "Ramesh (Supervisor)",
			"status": "In Storage",
			"guest": "G-00521",
			"notes": "Found near bedside charging stand. Kept in Main Cashier Safe.",
		},
		{
			"property": "Izensphere Stay and Dine",
			"item_description": "Designer Silk Scarf (Burberry Vintage Check)",
			"condition": "Found",
			"found_in_room": "Izensphere Dine-201",
			"found_on": "2026-11-03",
			"found_by": "Sunita (Housekeeping)",
			"status": "Returned",
			"guest": "G-00522",
			"returned_on": "2026-11-04",
			"notes": "Returned to guest at check-out desk after signature on register.",
		},
	]

	created = 0
	for itm in items:
		# check if an item with exact description and property exists
		if frappe.db.exists("Lost And Found Item", {
			"property": itm["property"],
			"item_description": itm["item_description"]
		}):
			continue
		doc = frappe.get_doc({
			"doctype": "Lost And Found Item",
			**itm,
		})
		doc.insert(ignore_permissions=True)
		created += 1

	frappe.db.commit()
	print(f"Seeded {created} new Lost & Found items successfully.")

