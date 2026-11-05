import frappe
from kamra.www.kamra import get_context_for_spa

no_cache = 1


def get_context(context):
	if frappe.request:
		path = frappe.request.path or ""
		subpath = path.replace("/stay-and-dine", "/izensphere-stay-and-dine", 1)
		frappe.local.flags.redirect_location = subpath or "/izensphere-stay-and-dine"
		raise frappe.Redirect
	return get_context_for_spa(context)

