module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  rules: {
    "no-unused-vars": "off",
    "@next/next/no-img-element": "warn",
    "react/no-unescaped-entities": "warn",
  },
  overrides: [
    {
      files: ["lib/**/*.{js,jsx,ts,tsx}"],
      rules: {
        "@next/next/no-assign-module-variable": "off",
      },
    },
    {
      files: [
        "components/workspace/engines/ExportEngine.jsx",
        "components/workspace/master-data/MasterDataRuntimeWorkCenter.jsx",
      ],
      rules: {
        "react-hooks/rules-of-hooks": "warn",
      },
    },
  ],
};
