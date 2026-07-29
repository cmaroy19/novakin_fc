// NOVAKIN FC - amelioration visuelle du desk (marquage des titres de workspace)
(function () {
	"use strict";

	function markHeaders() {
		var headers = document.querySelectorAll(".ce-block .ce-header");
		if (!headers.length) return;
		headers.forEach(function (h) {
			var tag = (h.tagName || "").toLowerCase();
			// H1/H2 = grand titre de page ; le reste = titres de section
			if (tag === "h1" || tag === "h2") {
				h.setAttribute("data-nfc", "title");
			} else {
				h.setAttribute("data-nfc", "section");
			}
		});
	}

	function boot() {
		markHeaders();
		// Re-marque a chaque changement du DOM (navigation SPA, chargement differe)
		var target = document.body;
		if (!target) return;
		var obs = new MutationObserver(function () {
			markHeaders();
		});
		obs.observe(target, { childList: true, subtree: true });
	}

	if (window.frappe && frappe.after_ajax) {
		frappe.after_ajax(boot);
	} else {
		document.addEventListener("DOMContentLoaded", boot);
	}
})();
