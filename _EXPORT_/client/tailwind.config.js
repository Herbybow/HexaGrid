/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            borderRadius: {
                DEFAULT: '0px',
                'none': '0px',
                'sm': '0px',
                'md': '0px',
                'lg': '0px',
                'full': '0px', // Force square everything
            },
            colors: {
                'brutal-black': '#000000',
                'brutal-white': '#ffffff',
            },
            fontFamily: {
                mono: ['"Courier New"', 'Courier', 'monospace'],
            }
        },
    },
    plugins: [],
}
