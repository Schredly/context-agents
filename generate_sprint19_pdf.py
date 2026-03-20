#!/usr/bin/env python3
"""Generate Sprint 19 deliverable as PDF."""

from fpdf import FPDF


class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(150, 150, 150)
        self.cell(0, 6, "Sprint 19 -- ServiceNow UI Action: Launch Agent Worker Popup", align="R")
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 30, 30)
        self.ln(4)
        self.cell(0, 10, title)
        self.ln(10)
        self.set_draw_color(200, 200, 200)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def sub_title(self, title):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(50, 50, 50)
        self.ln(2)
        self.cell(0, 8, title)
        self.ln(8)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(60, 60, 60)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def code_block(self, code):
        self.set_font("Courier", "", 8.5)
        self.set_text_color(40, 40, 40)
        self.set_fill_color(245, 245, 245)
        x = self.get_x()
        w = self.w - self.l_margin - self.r_margin
        # Draw background
        lines = code.split("\n")
        line_h = 4.2
        block_h = len(lines) * line_h + 6
        # Check if we need a page break
        if self.get_y() + block_h > self.h - self.b_margin:
            self.add_page()
        y_start = self.get_y()
        self.rect(x, y_start, w, block_h, "F")
        self.set_xy(x + 3, y_start + 3)
        for line in lines:
            self.cell(0, line_h, line)
            self.ln(line_h)
        self.ln(4)

    def table_row(self, cells, widths, bold=False, fill=False):
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 9)
        if fill:
            self.set_fill_color(240, 240, 240)
        self.set_text_color(50, 50, 50)
        x_start = self.get_x()
        max_h = 0
        # Calculate max height needed
        for i, cell in enumerate(cells):
            w = widths[i]
            # Estimate lines needed
            if self.get_string_width(cell) > w - 4:
                n_lines = max(1, int(self.get_string_width(cell) / (w - 4)) + 1)
            else:
                n_lines = 1
            h = n_lines * 5
            if h > max_h:
                max_h = h
        max_h = max(max_h, 6)
        # Check page break
        if self.get_y() + max_h > self.h - self.b_margin:
            self.add_page()
        y = self.get_y()
        for i, cell in enumerate(cells):
            w = widths[i]
            self.set_xy(x_start + sum(widths[:i]), y)
            self.set_draw_color(220, 220, 220)
            self.rect(self.get_x(), y, w, max_h, "D")
            if fill:
                self.rect(self.get_x(), y, w, max_h, "F")
            self.set_xy(x_start + sum(widths[:i]) + 2, y + 1)
            self.multi_cell(w - 4, 5, cell)
        self.set_y(y + max_h)

    def checklist_item(self, text):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(60, 60, 60)
        x = self.get_x()
        y = self.get_y()
        # Draw checkbox
        self.set_draw_color(180, 180, 180)
        self.rect(x, y + 0.5, 3.5, 3.5, "D")
        self.set_xy(x + 6, y)
        self.multi_cell(0, 5, text)
        self.ln(1)


def main():
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 12, "Sprint 19")
    pdf.ln(12)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, "ServiceNow UI Action: Launch Agent Worker Popup")
    pdf.ln(14)

    # =========================================================
    # SYSTEM PROPERTIES
    # =========================================================
    pdf.section_title("System Properties")
    pdf.body_text(
        "Create three System Properties via System Properties > All Properties > New. "
        "Set Read roles to 'itil' and Write roles to 'admin' on all three."
    )

    widths = [45, 20, 55, 55]
    pdf.table_row(["Name", "Type", "Value (example)", "Description"], widths, bold=True, fill=True)
    pdf.table_row(["x_agent.base_url", "string", "http://localhost:5173", "Base URL of the Agent UI (no trailing slash)"], widths)
    pdf.table_row(["x_agent.tenant_id", "string", "(paste tenant UUID)", "Tenant ID from the Agent setup wizard"], widths)
    pdf.table_row(["x_agent.tenant_secret", "string", "(paste shared secret)", "Shared secret from tenant activation"], widths)

    # =========================================================
    # UI ACTION RECORD
    # =========================================================
    pdf.section_title("UI Action Record")
    pdf.body_text("Create via System Definition > UI Actions > New:")

    widths2 = [55, 120]
    rows = [
        ("Name", "AI Resolution Assistant"),
        ("Table", "incident"),
        ("Action name", "ai_resolution_assistant"),
        ("Client", "true (checked)"),
        ("Form button", "true (checked)"),
        ("Form context menu", "false"),
        ("Form link", "false"),
        ("List banner button", "false"),
        ("List bottom button", "false"),
        ("List choice", "false"),
        ("List context menu", "false"),
        ("Order", "50"),
        ("Active", "true"),
        ("Show insert", "false"),
        ("Show update", "true"),
        ("Condition", "current.state != 7"),
        ("Roles", "itil"),
        ("Isolate script", "false"),
        ("Onclick", "aiResolutionAssistant()"),
        ("Script", "(see UI Action Script section)"),
    ]
    pdf.table_row(["Field", "Value"], widths2, bold=True, fill=True)
    for field, value in rows:
        pdf.table_row([field, value], widths2)

    pdf.ln(2)
    pdf.body_text(
        "The condition 'current.state != 7' hides the button on Closed incidents. "
        "'Show insert = false' and 'Show update = true' ensures it only appears on saved incidents."
    )

    # =========================================================
    # UI ACTION SCRIPT
    # =========================================================
    pdf.section_title("UI Action Script")
    pdf.body_text("Paste the following into the UI Action's Script field:")

    pdf.code_block(
        "function aiResolutionAssistant() {\n"
        "    var baseUrl   = gel('sysparm_x_agent_base_url')\n"
        "        ? gel('sysparm_x_agent_base_url').value  : '';\n"
        "    var tenantId  = gel('sysparm_x_agent_tenant_id')\n"
        "        ? gel('sysparm_x_agent_tenant_id').value : '';\n"
        "    var tenantSec = gel('sysparm_x_agent_tenant_sec')\n"
        "        ? gel('sysparm_x_agent_tenant_sec').value: '';\n"
        "\n"
        "    // Fallback to injected window globals\n"
        "    if (!baseUrl)   baseUrl   = window._agentBaseUrl   || '';\n"
        "    if (!tenantId)  tenantId  = window._agentTenantId  || '';\n"
        "    if (!tenantSec) tenantSec = window._agentTenantSec || '';\n"
        "\n"
        "    if (!baseUrl || !tenantId || !tenantSec) {\n"
        "        g_form.addErrorMessage(\n"
        "            'AI Resolution Assistant is not configured. '\n"
        "            + 'Ask your admin to set x_agent.base_url, '\n"
        "            + 'x_agent.tenant_id, and x_agent.tenant_secret.'\n"
        "        );\n"
        "        return false;\n"
        "    }\n"
        "\n"
        "    var e = encodeURIComponent;\n"
        "\n"
        "    // Required params\n"
        "    var params = [\n"
        "        'tenant_id='        + e(tenantId),\n"
        "        'tenant_secret='    + e(tenantSec),\n"
        "        'sys_id='           + e(g_form.getUniqueValue()),\n"
        "        'number='           + e(g_form.getValue('number')),\n"
        "        'short_description='\n"
        "            + e(g_form.getValue('short_description'))\n"
        "    ];\n"
        "\n"
        "    // Optional params\n"
        "    var cat = g_form.getValue('category');\n"
        "    if (cat) params.push('category='\n"
        "        + e(g_form.getDisplayValue('category') || cat));\n"
        "\n"
        "    var sub = g_form.getValue('subcategory');\n"
        "    if (sub) params.push('subcategory='\n"
        "        + e(g_form.getDisplayValue('subcategory') || sub));\n"
        "\n"
        "    var biz = g_form.getValue('business_service');\n"
        "    if (biz) params.push('business_service='\n"
        "        + e(g_form.getDisplayValue('business_service')\n"
        "        || biz));\n"
        "\n"
        "    var desc = g_form.getValue('description');\n"
        "    if (desc) params.push('description='\n"
        "        + e(desc.substring(0, 2000)));\n"
        "\n"
        "    var url = baseUrl + '/worker/servicenow?'\n"
        "        + params.join('&');\n"
        "\n"
        "    // Open centered popup\n"
        "    var w = 540, h = 720;\n"
        "    var left = (screen.width - w) / 2;\n"
        "    var top  = (screen.height - h) / 2;\n"
        "    window.open(url, 'ai_resolution_assistant',\n"
        "        'width=' + w + ',height=' + h\n"
        "        + ',left=' + left + ',top=' + top\n"
        "        + ',resizable=yes,scrollbars=yes'\n"
        "        + ',status=no,toolbar=no,menubar=no'\n"
        "        + ',location=no');\n"
        "\n"
        "    return false;\n"
        "}"
    )

    # =========================================================
    # COMPANION: CLIENT SCRIPT
    # =========================================================
    pdf.sub_title("Companion: Client Script (onLoad) - Inject Config")
    pdf.body_text(
        "Since gs.getProperty() is server-side only, create a Client Script on the incident table "
        "to inject the system property values into the browser context via GlideAjax."
    )

    widths3 = [40, 135]
    pdf.table_row(["Field", "Value"], widths3, bold=True, fill=True)
    pdf.table_row(["Name", "AI Agent - Inject Config"], widths3)
    pdf.table_row(["Table", "incident"], widths3)
    pdf.table_row(["Type", "onLoad"], widths3)
    pdf.table_row(["Active", "true"], widths3)

    pdf.ln(2)
    pdf.code_block(
        "function onLoad() {\n"
        "    var ga = new GlideAjax('AgentConfigAjax');\n"
        "    ga.addParam('sysparm_name', 'getAgentConfig');\n"
        "    ga.getXMLAnswer(function(answer) {\n"
        "        try {\n"
        "            var cfg = JSON.parse(answer);\n"
        "            window._agentBaseUrl   = cfg.base_url   || '';\n"
        "            window._agentTenantId  = cfg.tenant_id  || '';\n"
        "            window._agentTenantSec = cfg.tenant_secret || '';\n"
        "        } catch(e) { /* config not available */ }\n"
        "    });\n"
        "}"
    )

    # =========================================================
    # COMPANION: SCRIPT INCLUDE
    # =========================================================
    pdf.sub_title("Companion: Script Include (server-side)")
    pdf.body_text("Create a Script Include to serve the properties via GlideAjax:")

    pdf.table_row(["Field", "Value"], widths3, bold=True, fill=True)
    pdf.table_row(["Name", "AgentConfigAjax"], widths3)
    pdf.table_row(["Client callable", "true"], widths3)
    pdf.table_row(["Active", "true"], widths3)

    pdf.ln(2)
    pdf.code_block(
        "var AgentConfigAjax = Class.create();\n"
        "AgentConfigAjax.prototype = Object.extendsObject(\n"
        "    AbstractAjaxProcessor, {\n"
        "    getAgentConfig: function() {\n"
        "        return JSON.stringify({\n"
        "            base_url:      gs.getProperty(\n"
        "                'x_agent.base_url', ''),\n"
        "            tenant_id:     gs.getProperty(\n"
        "                'x_agent.tenant_id', ''),\n"
        "            tenant_secret: gs.getProperty(\n"
        "                'x_agent.tenant_secret', '')\n"
        "        });\n"
        "    },\n"
        "    type: 'AgentConfigAjax'\n"
        "});"
    )

    # =========================================================
    # UI16 + NEXT EXPERIENCE COMPATIBILITY
    # =========================================================
    pdf.section_title("UI16 + Next Experience Compatibility")

    widths4 = [35, 65, 75]
    pdf.table_row(["Concern", "UI16 (Classic)", "Next Experience (Polaris)"], widths4, bold=True, fill=True)
    pdf.table_row(["g_form", "Available", "Available (same API)"], widths4)
    pdf.table_row(["window.open()", "Works natively", "Works - Polaris runs in a browser tab"], widths4)
    pdf.table_row(["GlideModal", "Available but not needed", "Not available in workspace"], widths4)
    pdf.table_row(["GlideAjax", "Available", "Available in workspace client scripts"], widths4)
    pdf.table_row(["gel()", "Available (DOM)", "May not work - window globals fallback handles this"], widths4)
    pdf.table_row(["getDisplayValue()", "Returns display value", "Same behavior"], widths4)
    pdf.table_row(["description truncation", "2000 chars for URL limits", "Same"], widths4)
    pdf.table_row(["Popup blocker", "User may need to allow", "Same - standard browser behavior"], widths4)

    # =========================================================
    # FIELD MAPPING
    # =========================================================
    pdf.section_title("Field Mapping: ServiceNow -> URL Params")

    widths5 = [35, 60, 80]
    pdf.table_row(["URL Param", "ServiceNow Source", "Notes"], widths5, bold=True, fill=True)
    pdf.table_row(["tenant_id", "sys_property: x_agent.tenant_id", "Required. Via GlideAjax."], widths5)
    pdf.table_row(["tenant_secret", "sys_property: x_agent.tenant_secret", "Required. Via GlideAjax."], widths5)
    pdf.table_row(["sys_id", "g_form.getUniqueValue()", "Required. Current record."], widths5)
    pdf.table_row(["number", "g_form.getValue('number')", "Required."], widths5)
    pdf.table_row(["short_description", "g_form.getValue('short_description')", "Required."], widths5)
    pdf.table_row(["category", "g_form.getDisplayValue('category')", "Optional. Display value."], widths5)
    pdf.table_row(["subcategory", "g_form.getDisplayValue('subcategory')", "Optional. Display value."], widths5)
    pdf.table_row(["business_service", "g_form.getDisplayValue('business_service')", "Optional. Display value."], widths5)
    pdf.table_row(["description", "g_form.getValue('description')", "Optional. Truncated to 2000 chars."], widths5)

    # =========================================================
    # TESTING CHECKLIST
    # =========================================================
    pdf.section_title("Testing Checklist")

    pdf.sub_title("Setup")
    for item in [
        "System Property x_agent.base_url is set (e.g. http://localhost:5173)",
        "System Property x_agent.tenant_id is set to an activated tenant's ID",
        "System Property x_agent.tenant_secret is set to that tenant's shared secret",
        "Script Include AgentConfigAjax is created and marked Client callable",
        "Client Script 'AI Agent - Inject Config' is created and active on incident table",
        "UI Action 'AI Resolution Assistant' is created and active on incident table",
        "Agent backend is running (uvicorn main:app --port 8000)",
        "Agent frontend is running (npm run dev on port 5173)",
    ]:
        pdf.checklist_item(item)

    pdf.sub_title("UI Action Visibility")
    for item in [
        "Button appears on an existing open incident (state != Closed)",
        "Button does NOT appear on new/unsaved incident form",
        "Button does NOT appear on Closed incidents (state = 7)",
        "Button is only visible to users with itil role",
    ]:
        pdf.checklist_item(item)

    pdf.sub_title("Popup Launch")
    for item in [
        "Clicking the button opens a centered popup window (~540x720)",
        "Popup URL contains all required params: tenant_id, tenant_secret, sys_id, number, short_description",
        "Popup URL contains optional params when fields are populated: category, subcategory, business_service, description",
        "Special characters in short_description / description are URL-encoded correctly",
        "Popup shows 'AI Resolution Assistant' header with incident number",
    ]:
        pdf.checklist_item(item)

    pdf.sub_title("Error Handling")
    for item in [
        "If sys_properties are missing, form shows error message instead of opening popup",
        "If incident has empty short_description, popup shows the missing params error panel",
    ]:
        pdf.checklist_item(item)

    pdf.sub_title("End-to-End Flow")
    for item in [
        "Popup shows 'Ready' status and 'Run' button",
        "Clicking 'Run' starts the skill chain and shows live skill trace",
        "After completion, result panel shows with summary, confidence, steps, sources",
        "'Update Task' button is enabled after resolution is ready",
        "Clicking 'Update Task' writes back to the incident's work_notes",
        "Incident work_notes field shows the AI resolution after refresh",
        "Status pill shows 'Updated' after successful writeback",
    ]:
        pdf.checklist_item(item)

    pdf.sub_title("Cross-Experience")
    for item in [
        "Test in UI16 (classic): button + popup works",
        "Test in Next Experience / Agent Workspace: button + popup works",
    ]:
        pdf.checklist_item(item)

    # Save
    out = "/Users/groovingtothemusic/context-agents/context-agents/Sprint_19_ServiceNow_UI_Action.pdf"
    pdf.output(out)
    print(f"PDF written to: {out}")


if __name__ == "__main__":
    main()
