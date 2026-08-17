import frappe


def get_context(context):
    token = frappe.form_dict.get("token")

    if not token:
        frappe.throw("Code de vérification manquant", frappe.DoesNotExistError)

    courrier = frappe.db.get_value(
        "Courrier Entrant",
        {"verification_token": token},
        [
            "name",
            "reference",
            "date_reception",
            "mode_reception"
        ],
        as_dict=True
    )

    if not courrier:
        context.verification_valide = False
        context.no_cache = 1
        return context

    context.verification_valide = True
    context.courrier = courrier
    context.no_cache = 1

    return context
