module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    "@typescript-eslint/no-unused-vars": "warn",
    "react/no-unescaped-entities": "warn",
    "@next/next/no-img-element": "warn",
    "import/no-anonymous-default-export": "warn",
    "react-hooks/exhaustive-deps": "warn",
  },
  overrides: [
    {
      files: ["lib/ubte/**/*.{js,jsx,ts,tsx}"],
      rules: {
        "@next/next/no-assign-module-variable": "off",
      },
    },
  ],
};
