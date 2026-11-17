import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
  	extend: {
  		fontFamily: {
  			sans: [
  				'"Inter Variable"',
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'sans-serif'
  			]
  		},
  		colors: {
  			border: 'hsl(var(--border) / <alpha-value>)',
  			input: 'hsl(var(--input) / <alpha-value>)',
  			ring: 'hsl(var(--ring) / <alpha-value>)',
  			background: 'hsl(var(--background) / <alpha-value>)',
  			foreground: 'hsl(var(--foreground) / <alpha-value>)',
  			primary: {
  				DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
  				foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
  				ink: 'hsl(var(--primary-ink) / <alpha-value>)'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
  				foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
  				foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
  				ink: 'hsl(var(--destructive-ink) / <alpha-value>)'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success) / <alpha-value>)',
  				foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
  				ink: 'hsl(var(--success-ink) / <alpha-value>)'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
  				foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
  				ink: 'hsl(var(--warning-ink) / <alpha-value>)'
  			},
  			info: {
  				DEFAULT: 'hsl(var(--info) / <alpha-value>)',
  				foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
  				ink: 'hsl(var(--info-ink) / <alpha-value>)'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
  				foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
  				foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
  				foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card) / <alpha-value>)',
  				foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
  			},
  			code: {
  				DEFAULT: 'hsl(var(--code) / <alpha-value>)',
  				foreground: 'hsl(var(--code-foreground) / <alpha-value>)',
  				muted: 'hsl(var(--code-muted) / <alpha-value>)',
  				chip: 'hsl(var(--code-chip) / <alpha-value>)',
  				key: 'hsl(var(--code-key) / <alpha-value>)',
  				string: 'hsl(var(--code-string) / <alpha-value>)',
  				number: 'hsl(var(--code-number) / <alpha-value>)'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar) / <alpha-value>)',
  				foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
  				accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground) / <alpha-value>)',
  				active: 'hsl(var(--sidebar-active) / <alpha-value>)',
  				border: 'hsl(var(--sidebar-border) / <alpha-value>)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			/*
  			 * Sorotan alasan di panel detail absensi. Bayangannya memakai
  			 * `currentColor`, jadi warnanya ikut token teksnya dan tetap benar di
  			 * mode gelap maupun terang tanpa hex yang ditanam di komponen.
  			 */
  			'reason-glow': {
  				'0%, 100%': { textShadow: '0 0 4px currentColor' },
  				'50%': { textShadow: '0 0 14px currentColor, 0 0 24px currentColor' }
  			},
  			/*
  			 * Sapuan bar kemajuan yang tidak tahu persentasenya. Dipakai saat server
  			 * hanya mengirim jumlah baris yang sudah diproses tanpa jumlah totalnya,
  			 * karena bar yang berhenti di nol terbaca sebagai macet.
  			 */
  			'progress-sweep': {
  				'0%': { transform: 'translateX(-100%)' },
  				'100%': { transform: 'translateX(300%)' }
  			},
  			/* Jari penunjuk yang bergoyang ke arah teks di sebelah kirinya. */
  			'point-left': {
  				'0%, 100%': { transform: 'translateX(0)' },
  				'50%': { transform: 'translateX(-0.35rem)' }
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'collapsible-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-collapsible-content-height)'
  				}
  			},
  			'collapsible-up': {
  				from: {
  					height: 'var(--radix-collapsible-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'reason-glow': 'reason-glow 1.8s ease-in-out infinite',
  			'point-left': 'point-left 0.9s ease-in-out infinite',
  			'progress-sweep': 'progress-sweep 1.4s ease-in-out infinite',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'collapsible-down': 'collapsible-down 0.2s ease-out',
  			'collapsible-up': 'collapsible-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [animate],
} satisfies Config
