const AccountingWorkspace = {
          id: "accounting",
          name: "Accounting",
          description: "Core accounting, posting, ledgers and accounting structure.",
          order: 10,
          items: [
            { id: "chart_of_accounts", name: "Chart of Accounts", route: "/finance/chart-of-accounts", description: "Maintain account structure.", order: 10, type: "business-workspace", document: "Account", create:{
enabled:true,
  type: "document",
                  id: "account",
                  engine:"create",
                  capability:"account",
action:"upsertAccount",
form:"chart-of-account",
api:"/api/finance/chart-of-accounts/upsert",
                  label: "+ Account",
                  title: "Account"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                {
                  id: "delete",
                  type: "delete",
                  label: "Delete Account",
                  api: "/api/finance/chart-of-accounts/delete",
                  method: "POST",
                  danger: true
                }
              ],
 api: "/api/finance/chart-of-accounts", rowsKey: "accounts",  search: ["account_code","account_name","account_type","category","status"], name: r => r.account_name || r.name || "Unnamed Account", subtitle: r => [r.account_code || "-", r.account_type || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/chart-of-accounts"
},

data:{
  capability:"account"
},

actions:[
  {
    type:"edit",
    label:"Edit Account"
  }
]
},
            { id: "general_ledger", name: "General Ledger", route: "/finance/ledger", description: "Review ledger activity and balances.", order: 20, type: "business-workspace", document: "LedgerEntry", 
create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/general-ledger", rowsKey: "entries",   search: ["account_code","account_name","reference","description","created_at"], name: r => r.account_name || r.reference || "Ledger Entry", subtitle: r => [r.account_code || "-", r.created_at || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/general-ledger"
},

data:{
  capability:"ledger_entry"
}
},
            { id: "journals", name: "Journals", route: "/finance/journals", description: "Create, review and reverse journal entries.", order: 30, type: "business-workspace", document: "JournalEntry", create:{
enabled:true,
type:"document",
engine:"create",
id:"journal_entry",
form:"journal-entry",
api:"/api/finance/journals/create",
label:"+ Journal",
title:"New Journal Entry"
},

ui:{
              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/journals", rowsKey: "journals",  search: ["journal_number","reference","description","status"], name: r => r.journal_number || r.reference || "Journal", subtitle: r => [r.status || "-", r.created_at || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/journals"
},

data:{
  capability:"journal_entry"
},

actions:[
  {
    type:"capability",
    label:"Request Reversal",
    capability:"general_ledger",
    action:"requestJournalReversalCommand"
  }
] },
            { id: "trial_balance", name: "Trial Balance", route: "/finance/trial-balance", description: "Review trial balance by period.", order: 40, type: "business-workspace", document: "TrialBalanceLine", 
create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/trial-balance", rowsKey: "rows",   search: ["account_code","account_name","account_type"], name: r => r.account_name || "Trial Balance Line", subtitle: r => [r.account_code || "-", r.account_type || "-"] },

runtime:{
 renderer:"MasterDataRuntimeWorkCenter",
 listApi:"/api/finance/trial-balance"
},

data:{
 capability:"trial_balance"
}
},
            { id: "fiscal_periods", name: "Fiscal Periods", route: "/finance/fiscal-periods", description: "Manage fiscal periods and locks.", order: 50, type: "business-workspace", document: "FiscalPeriod", create:{
enabled:false
},

ui:{
 api: "/api/finance/periods", rowsKey: "periods",  search: ["period_name","status"], name: r => r.period_name || "Unnamed Period", subtitle: r => [r.start_date || "-", r.end_date || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/periods"
},

data:{
  capability:"fiscal_period"
},

actions:[
  {
    type:"edit",
    label:"Edit Period"
  }
]
},
            { id: "dimensions", name: "Dimensions", route: "/finance/dimensions", description: "Manage departments, cost centers and reporting dimensions.", order: 60, type: "business-workspace", document: "Dimension", create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/dimensions/runtime", rowsKey: "costCenters",  search: ["name","code","type"], name: r => r.name || "Unnamed Dimension", subtitle: r => [r.type || "-", r.code || "-"] }, runtime:{renderer:"MasterDataRuntimeWorkCenter",listApi:"/api/finance/dimensions/runtime"}, data:{capability:"cost_center"} },
            { id: "opening_balances", name: "Opening Balances", route: "/finance/opening-balances", description: "Load opening balances for new entities and clients.", order: 70, type: "business-workspace", document: "OpeningBalance", status: "planned" },
            { id: "recurring_journals", name: "Recurring Journals", route: "/finance/recurring-journals", description: "Manage recurring journals and scheduled postings.", order: 80, type: "business-workspace", document: "RecurringJournal", status: "planned" }
          ]
};

export default AccountingWorkspace;
