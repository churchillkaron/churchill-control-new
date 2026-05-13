await createAuditLog({

  tenantId,

  module:
    "finance",

  actionType:
    "create_journal_entry",

  entityType:
    "journal_entry",

  entityId:
    journalEntry.id,

  newData: {

    entry_number:
      entryNumber,

    total_debits:
      roundedDebits,

    total_credits:
      roundedCredits,

  },

});