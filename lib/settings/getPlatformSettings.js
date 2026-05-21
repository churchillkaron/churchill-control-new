export async function getPlatformSettings() {

  return {

    restaurant: {

      name:
        'Churchill',

      timezone:
        'Asia/Bangkok',

      currency:
        'THB',
    },

    modules: [

      'POS',
      'Kitchen',
      'Production',
      'Procurement',
      'Finance',
      'Accounting',
      'AI Operations',
      'Security',
    ],

    integrations: {

      printer:
        true,

      kitchen_display:
        true,

      accounting:
        true,

      ai_engine:
        true,
    },

    status:
      'ACTIVE',
  }
}
