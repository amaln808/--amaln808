import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './site.css'
import { links } from './links.js'

const wa = (text) => `https://wa.me/${links.whatsapp}?text=${encodeURIComponent(text)}`

// أزرار واتساب: كل زر يحمل رسالته الجاهزة في data-wa
document.querySelectorAll('[data-wa]').forEach((a) => {
  a.href = wa(a.dataset.wa)
  a.target = '_blank'
  a.rel = 'noopener'
})

// الروابط الاختيارية: تظهر فقط إن كانت معبأة في links.js
const build = {
  phone: (v) => `tel:${v}`,
  email: (v) => `mailto:${v}`,
}
document.querySelectorAll('[data-link]').forEach((el) => {
  const key = el.dataset.link
  const value = links[key]
  const item = el.closest('[data-optional]') ?? el
  if (!value) {
    item.hidden = true
    return
  }
  el.href = build[key] ? build[key](value) : value
  if (!build[key]) {
    el.target = '_blank'
    el.rel = 'noopener'
  }
  const shown = el.querySelector('[data-show]')
  if (shown) shown.textContent = key === 'phone' ? value.replace(/^\+968(\d{4})(\d{4})$/, '+968 $1 $2') : value
})

// قسم الحسابات يختفي كله إن لم يُعبأ أي حساب
document.querySelectorAll('[data-group]').forEach((g) => {
  if (![...g.querySelectorAll('[data-optional]')].some((i) => !i.hidden)) g.hidden = true
})

document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())))
