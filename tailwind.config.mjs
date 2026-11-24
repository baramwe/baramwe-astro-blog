/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
	],
	theme: {
		extend: {
			colors: {
				// 골프 스코어 다크 테마 (Kibana 9 Borealis dark 기준)
				kb: {
					page: '#07101F',
					panel: '#0B1628',
					sunken: '#0E1A2E',
					hover: '#13223A',
					border: '#2B394F',
					'border-strong': '#40506A',
					title: '#E3E8F2',
					text: '#CAD3E2',
					subdued: '#98A8C3',
					muted: '#6A7FA0',
					primary: '#61A2FF',
					'primary-hover': '#8BBAFF',
					'primary-subtle': '#0D2F5E',
					ink: '#07101F',
					success: '#24C292',
					'success-subtle': '#0B3A2E',
					danger: '#F6726A',
					'danger-subtle': '#4A1A1C',
					warning: '#FACB3D',
					'warning-subtle': '#3D3014',
					// 승·패 전용 — 남색 배경·파랑 주색과 어울리게 채도를 낮춘 청록 / 로즈
					win: '#48C9C0',
					loss: '#E8828E',
				},
				// 블루와인 브랜드 컬러
				primary: {
					50: '#eff6ff',
					100: '#dbeafe',
					200: '#bfdbfe',
					300: '#93c5fd',
					400: '#60a5fa',
					500: '#3b82f6',
					600: '#2563eb',
					700: '#1d4ed8',
					800: '#1e40af',
					900: '#1e3a8a',
				},
				emerald: {
					50: '#ecfdf5',
					100: '#d1fae5',
					200: '#a7f3d0',
					300: '#6ee7b7',
					400: '#34d399',
					500: '#10b981',
					600: '#059669',
					700: '#047857',
					800: '#065f46',
					900: '#064e3b',
				}
			},
			fontFamily: {
				sans: [
					'ui-sans-serif',
					'system-ui',
					'-apple-system',
					'Inter',
					'Pretendard',
					'Apple SD Gothic Neo',
					'Noto Sans KR',
					'sans-serif'
				],
			},
		},
	},
	plugins: [],
}
