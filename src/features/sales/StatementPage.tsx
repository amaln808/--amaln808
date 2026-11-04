import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { FormError } from '../../components/form'
import { initialPeriod, PeriodFilter, resolvePeriod } from '../../components/PeriodFilter'
import { PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchOrders, ORDERS_KEY } from '../../data/orders'
import { fetchSales, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { buildCustomerStatement, customerEntries } from '../../domain/statement'
import { type DocLang, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { PdfPanel } from '../documents/DocumentPanel'
import { type StatementDocData, StatementDocument } from '../documents/StatementDocument'
import { summarize } from './summary'

/** A customer's statement of account for a period, as a PDF to send by WhatsApp. */
export function StatementPage() {
  const { id = '' } = useParams()
  const sales = useQuery(SALES_KEY, fetchSales)
  const orders = useQuery(ORDERS_KEY, fetchOrders)
  const settings = useSettingsQuery().data
  const [period, setPeriod] = useState(() => initialPeriod('all'))
  const today = todayIso()
  const back = { to: `/customers/${id}`, label: t('العميل', 'Customer') }

  const data = sales.data
  const customer = data?.customers.find((c) => c.id === id)
  if (!data || !customer || orders.loading) {
    return (
      <>
        <PageHeader title={t('كشف حساب', 'Statement of account')} back={back} />
        {sales.error ? <FormError message={serverError(sales.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }

  const range = resolvePeriod(period)
  const all = period.key === 'all'
  const to = all ? today : range.to
  const statement = buildCustomerStatement(customerEntries(id, { invoices: data.invoices, payments: data.payments, orders: orders.data ?? [] }), { from: range.from, to })
  // What is still unpaid today (the period does not change it)
  const { invoiceInfo, owedOnOrders } = summarize(data, today, orders.data ?? [])
  const orderDate = new Map((orders.data ?? []).map((o) => [o.id, o.orderDate]))
  const open: StatementDocData['open'] = [
    ...data.invoices
      .filter((i) => i.customerId === id && i.status === 'issued')
      .map((i) => ({ i, info: invoiceInfo.get(i.id) }))
      .filter(({ i, info }) => info && i.totalBaisa - info.paidBaisa > 0)
      .map(({ i, info }) => ({ ref: i.invoiceNo, date: i.date, dueDate: i.dueDate, leftBaisa: i.totalBaisa - info!.paidBaisa, late: info!.status === 'overdue' })),
    ...owedOnOrders
      .filter((o) => o.customerId === id && o.leftBaisa > 0)
      .map((o) => ({ ref: o.orderNo, date: orderDate.get(o.orderId) ?? today, dueDate: o.dueDate, leftBaisa: o.leftBaisa, late: o.overdueBaisa > 0 })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const doc: StatementDocData = {
    customer: { name: customer.name, phone: customer.phone, address: customer.address, vatNo: customer.vatNo },
    from: all ? null : range.from,
    to,
    issuedOn: today,
    statement,
    open,
  }
  const company = (lang: DocLang) => (settings ? (lang === 'en' ? settings.companyNameEn || settings.companyName : settings.companyName) : '')
  const shareText = (lang: DocLang) => {
    const amount = formatOMR(Math.abs(statement.closingBaisa), lang === 'en' ? 'en' : 'ar')
    const ar =
      statement.closingBaisa > 0
        ? `مرفق كشف حسابكم لدى ${company('ar')}، والرصيد المستحق ${amount}. نشكر تعاونكم.`
        : `مرفق كشف حسابكم لدى ${company('ar')}${statement.closingBaisa < 0 ? `، ولكم رصيد ${amount}` : '، والحساب مسدد بالكامل'}. شكراً لتعاملكم معنا.`
    const en =
      statement.closingBaisa > 0
        ? `Please find attached your statement of account with ${company('en')}. Balance due: ${amount}. Thank you.`
        : `Please find attached your statement of account with ${company('en')}${statement.closingBaisa < 0 ? `; you have a credit of ${amount}` : '; it is fully settled'}. Thank you for your business.`
    return lang === 'ar' ? ar : lang === 'en' ? en : `${ar}\n\n${en}`
  }

  return (
    <>
      <PageHeader
        title={t(`كشف حساب: ${customer.name}`, `Statement: ${customer.name}`)}
        subtitle={t(
          'الفواتير والطلبيات والمدفوعات ورصيدها بعد كل حركة. يُرسل ملف PDF للعميل عبر واتساب.',
          'Invoices, orders and payments with the balance after each. Send it to the customer as a PDF by WhatsApp.',
        )}
        back={back}
      />
      <div className="flex flex-col gap-5">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('الرصيد السابق', 'Opening balance')} value={formatOMR(statement.openingBaisa)} />
          <Stat label={t('الفواتير والطلبيات', 'Invoices & orders')} value={formatOMR(statement.chargesBaisa)} />
          <Stat label={t('المدفوعات', 'Payments')} value={formatOMR(statement.paymentsBaisa)} tone={statement.paymentsBaisa ? 'green' : undefined} />
          <Stat
            label={statement.closingBaisa < 0 ? t('رصيد للعميل', 'Customer credit') : t(`الرصيد في ${formatDate(to)}`, `Balance on ${formatDate(to)}`)}
            value={formatOMR(Math.abs(statement.closingBaisa))}
            tone={statement.closingBaisa > 0 ? 'red' : 'green'}
          />
        </div>
        {settings && (
          <PdfPanel
            settings={settings}
            dataKey={JSON.stringify(doc)}
            filename={(l) => `${l === 'en' ? 'Statement' : 'كشف حساب'} - ${customer.name}.pdf`}
            subject={t(`كشف حساب ${customer.name}`, `Statement — ${customer.name}`)}
            shareText={shareText}
            phone={customer.phone}
            email={customer.email}
            render={(ref, { company, images, lang }) => <StatementDocument ref={ref} data={doc} company={company} images={images} lang={lang} />}
          />
        )}
      </div>
    </>
  )
}
