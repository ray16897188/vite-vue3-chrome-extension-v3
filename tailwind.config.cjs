/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{index,vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
    require('daisyui'),
  ],
  daisyui: {
    themes: ["light", "dark", "cupcake", "aqua", "bumblebee", "emerald", "corporate", "synthwave", "retro", "cyberpunk", "valentine", "halloween", "garden", "forest", "alien", "lofi", "pastel", "fantasy", "wireframe", "black", "luxury"],
  },
}
