# Copyright (c) 2026, Kamra and contributors
# For license information, please see license.txt

from frappe import _


def get_data():
	return {
		"fieldname": "room",
		"transactions": [
			{"label": _("Front Desk"), "items": ["Reservation", "Room Block"]},
			{"label": _("Housekeeping"), "items": ["Housekeeping Task"]},
			{"label": _("Operations"), "items": ["Service Ticket", "Laundry Order"]},
		],
	}
