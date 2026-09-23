import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Plus,
  BriefcaseBusiness,
  Wallet,
  ReceiptText,
  Fuel,
  SlidersHorizontal,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CircleHelp,
  Info,
  Download,
  Search,
  Check,
  Coffee,
  Wifi,
} from "lucide-react";
import {
  forecast,
  calculatePayroll,
  localDate,
  addDays,
  isWorkday,
  daysBetween,
  getHoliday,
  isNationalHoliday,
  type AppState,
  type Need,
  type Transaction,
  type ForecastResult,
} from "@danasiap/core";
import {
  DateLabel,
  Money,
  PanelHeading,
  NeedCard,
  TransactionRow,
  Empty,
  CardChip,
  MoneyInput,
  CustomSelect,
} from "./components";

export type Page =
  | "home"
  | "plans"
  | "calendar"
  | "insights"
  | "history"
  | "settings";
export type Dialog =
  | { type: "transaction"; kind?: "income" | "expense" }
  | { type: "need"; need?: Need }
  | { type: "attendance"; date?: string }
  | { type: "transaction-detail"; transaction: Transaction }
  | { type: "setup" }
  | { type: "notifications" }
  | { type: "auth" };
export interface PageProps {
  state: AppState;
  prediction: ForecastResult;
  open: (dialog: Dialog) => void;
  navigate: (page: Page) => void;
}

export function CashChart({
  state,
  compact = false,
}: {
  state: AppState;
  compact?: boolean;
}) {
  const [period, setPeriod] = useState(7);
  const projection = forecast(state, { horizonDays: period });
  const data = projection.days.slice(0, period);
  const max = Math.max(
    ...data.map((day) => Math.max(day.income, day.expenses)),
    1,
  );
  return (
    <section className={`panel chart-panel ${compact ? "compact" : ""}`}>
      <PanelHeading
        title="Alur uang"
        subtitle="Perkiraan pemasukan & kebutuhan"
      />
      <div className="chart-toolbar">
        <div
          className="period-toggle"
          role="group"
          aria-label="Periode prediksi"
        >
          {[7, 14, 30].map((n) => (
            <button
              key={n}
              className={period === n ? "selected" : ""}
              aria-pressed={period === n}
              onClick={() => setPeriod(n)}
            >
              {n} hari
            </button>
          ))}
        </div>
        <div className="chart-legend">
          <span>
            <i className="legend-lime" />
            Masuk
          </span>
          <span>
            <i className="legend-black" />
            Keluar
          </span>
        </div>
      </div>
      <div
        className="bar-chart"
        role="img"
        aria-label={`Perkiraan pemasukan dan kebutuhan ${period} hari ke depan. Saldo akhir ${projection.projectedBalance} rupiah.`}
      >
        <div className="chart-y">
          <span>{Math.ceil(max / 1000)} rb</span>
          <span>{Math.ceil(max / 2000)} rb</span>
          <span>0</span>
        </div>
        <div className="bar-plot">
          {data.map((day, index) => (
            <div
              className="bar-group"
              key={day.date}
              title={`${day.date}: masuk Rp${day.income}, keluar Rp${day.expenses}`}
            >
              <div className="bars">
                <div
                  className="bar income-bar"
                  style={{ height: `${(day.income / max) * 100}%` }}
                />
                <div
                  className="bar expense-bar"
                  style={{ height: `${(day.expenses / max) * 100}%` }}
                />
              </div>
              <span>
                {period <= 14
                  ? new Date(`${day.date}T12:00:00`).getDate()
                  : index % 5 === 0
                    ? new Date(`${day.date}T12:00:00`).getDate()
                    : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-foot">
        <span>Prediksi saldo akhir</span>
        <Money amount={projection.projectedBalance} />
        <ArrowUpRight size={17} />
      </div>
    </section>
  );
}

export function Dashboard({ state, prediction, open, navigate }: PageProps) {
  const today = localDate();
  const month = today.slice(0, 7);
  const entries = state.transactions.filter(
    (t) => t.date.startsWith(month) && t.date <= today,
  );
  const income = entries
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const spent = entries
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const nextNeeds = state.needs
    .filter((n) => !n.paid)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const simulation = forecast(state, { horizonDays: 30, absentDates: [today] });
  const difference = Math.max(0, simulation.shortfall - prediction.shortfall);
  const isOff = !isWorkday(state, today);
  const recorded = state.attendance.find((a) => a.date === today && !a.planned);
  const payroll = calculatePayroll(state, today);
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">SATU LANGKAH LEBIH SIAP</span>
          <h1>
            Uangnya terarah.
            <br className="mobile-only" /> Harinya tenang
          </h1>
        </div>
        <button
          className="button dark desktop-only"
          onClick={() => open({ type: "transaction" })}
        >
          <Plus size={17} /> Catat transaksi
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="wallet-section">
          <div className="balance-card">
            <div className="balance-surface" aria-hidden="true">
              <div className="contour" />
            </div>
            <button
              className="budget-pill"
              onClick={() => open({ type: "need" })}
            >
              <span>
                <Plus size={13} />
              </span>
              Atur dana
            </button>
            <div className="balance-brand">DanaSiap</div>
            <div className="balance-main">
              <span>
                Saldo saat ini <Wallet size={14} />
              </span>
              <Money amount={prediction.currentBalance} />
            </div>
            <div className="balance-account">
              <span>•••• &nbsp; •••• &nbsp; RUPIAH</span>
            </div>
            <div className="balance-bottom">
              <div>
                <span>Pemasukan bulan ini</span>
                <strong>
                  <ArrowDownLeft size={14} />
                  <Money amount={income} />
                </strong>
              </div>
              <div>
                <span>Pengeluaran bulan ini</span>
                <strong>
                  <ArrowUpRight size={14} />
                  <Money amount={spent} />
                </strong>
              </div>
            </div>
            <span className="balance-stripe" aria-hidden="true">
              <Wifi size={23} />
            </span>
            <CardChip className="card-chip-position" />
          </div>
          <div className="quick-actions">
            {[
              {
                title: "Pemasukan",
                Icon: ArrowDownLeft,
                action: () => open({ type: "transaction", kind: "income" }),
              },
              {
                title: "Pengeluaran",
                Icon: ArrowUpRight,
                action: () => open({ type: "transaction", kind: "expense" }),
              },
              {
                title: "Hari kerja",
                Icon: BriefcaseBusiness,
                action: () => open({ type: "attendance" }),
              },
              {
                title: "Kebutuhan",
                Icon: Plus,
                action: () => open({ type: "need" }),
              },
            ].map(({ title, Icon, action }) => (
              <button key={title} onClick={action}>
                <span>
                  <Icon size={22} strokeWidth={1.5} />
                </span>
                {title}
              </button>
            ))}
          </div>
        </section>
        <section className="daily-panel panel">
          <div className="panel-heading">
            <h2>Ruang gerak hari ini</h2>
            <span className={`status-pill ${prediction.status}`}>
              {prediction.status === "shortfall"
                ? "Perlu perhatian"
                : prediction.status === "warning"
                  ? "Hati-hati"
                  : "Terkendali"}
            </span>
          </div>
          <span className="muted">Aman untuk dipakai</span>
          <Money amount={prediction.safeToSpend} className="daily-amount" />
          <div className="dashed-rule" />
          <div className="daily-row">
            <span>Dana yang sudah disiapkan</span>
            <Money amount={prediction.allocated} />
          </div>
          <div className="daily-row">
            <span>Sisa hari kerja · 30 hari</span>
            <strong>{prediction.workdays} hari</strong>
          </div>
          <button className="daily-link" onClick={() => navigate("insights")}>
            Lihat hitungannya <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="daily-panel panel payroll-panel">
          <div className="panel-heading">
            <h2>Estimasi Gajian & Akumulasi</h2>
            <span className="status-pill safe">
              {payroll.daysUntilPayday === 0
                ? "Hari ini gajian!"
                : `${payroll.daysUntilPayday} hari lagi`}
            </span>
          </div>
          <span className="muted">
            Proyeksi gaji akhir bulan (cair {payroll.nextPayday})
          </span>
          <Money amount={payroll.projectedMonthEnd} className="daily-amount" />
          <div className="dashed-rule" />
          <div className="daily-row">
            <span>Hak gaji terkumpul s/d hari ini</span>
            <strong>
              <Money amount={payroll.accruedCurrentMonth} />
            </strong>
          </div>
          <div className="daily-row">
            <span>Kehadiran kerja bulan ini</span>
            <strong>
              {payroll.actualWorkdays} dari {payroll.totalMonthWorkdays} hari
            </strong>
          </div>
          {state.profile.activityAllowance ? (
            <div className="daily-row">
              <span>Uang saku cash diterima (bulan ini)</span>
              <strong>
                <Money amount={payroll.allowanceReceived} />
              </strong>
            </div>
          ) : null}
          <div className="daily-row">
            <span>Periode hitungan</span>
            <small className="muted">
              {payroll.monthStart} s/d {payroll.monthEnd}
            </small>
          </div>
        </section>
        <section className="needs-section">
          <PanelHeading
            title="Sedang disiapkan"
            action="Semua rencana"
            onClick={() => navigate("plans")}
          />
          {nextNeeds.length ? (
            <div className="needs-grid">
              {nextNeeds.map((need) => (
                <NeedCard
                  key={need.id}
                  need={need}
                  onOpen={() => open({ type: "need", need })}
                />
              ))}
            </div>
          ) : (
            <Empty
              icon={<Wallet />}
              title="Mulai siapkan kebutuhanmu"
              action={
                <button
                  className="button lime"
                  onClick={() => open({ type: "need" })}
                >
                  Tambah kebutuhan <Plus size={17} />
                </button>
              }
            >
              Masukkan bensin, utang, atau target tabungan pertama.
            </Empty>
          )}
        </section>
        <section className="work-card">
          <div className="work-card-top">
            <span className="circle-outline">
              <BriefcaseBusiness size={20} />
            </span>
            <span>HARI KERJA, UANG TERJAGA</span>
            <span className="work-card-badge">
              <Check size={12} strokeWidth={2.5} /> Terjadwal
            </span>
          </div>
          <h2>
            {isOff
              ? "Hari libur?"
              : recorded
                ? "Hari ini sudah tercatat."
                : "Hari ini masuk?"}
          </h2>
          <p>
            {isOff ? (
              "Tidak ada pemasukan yang diharapkan hari ini. Rencanamu sudah memperhitungkannya."
            ) : difference > 0 ? (
              <>
                Kalau tidak masuk, kekurangan dana bertambah{" "}
                <strong>
                  <Money amount={difference} />
                </strong>
                .
              </>
            ) : (
              <>
                Cek dampaknya ke rencana sebelum memutuskan. Prediksi mengikuti
                hari kerja kamu.
              </>
            )}
          </p>
          <button
            className="button dark"
            onClick={() => open({ type: "attendance" })}
          >
            {recorded ? "Lihat kehadiran" : "Catat kehadiran"}{" "}
            <ArrowUpRight size={17} />
          </button>
        </section>
        <section className="activity-panel panel">
          <PanelHeading
            title="Aktivitas terakhir"
            action="Lihat semua"
            onClick={() => navigate("history")}
          />
          {state.transactions.length ? (
            <div className="transaction-list">
              {[...state.transactions]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 5)
                .map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onClick={() =>
                      open({ type: "transaction-detail", transaction })
                    }
                  />
                ))}
            </div>
          ) : (
            <Empty icon={<ReceiptText />} title="Belum ada transaksi">
              Catat pengeluaran pertama supaya uangmu mulai terbaca.
            </Empty>
          )}
        </section>
        <CashChart state={state} compact />
      </div>
      <div className="forecast-note">
        <Info size={15} />
        <span>
          Prediksi memakai jadwal kerja dan data yang kamu catat. Pengeluaran
          mendadak akan mengubah hasilnya.
        </span>
      </div>
    </>
  );
}

export function Plans({ state, prediction, open }: PageProps) {
  const [filter, setFilter] = useState("all");
  const visible = state.needs
    .filter((n) => !n.paid && (filter === "all" || n.kind === filter))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">UANG YANG PUNYA TUJUAN</span>
          <h1>Rencana kebutuhan</h1>
        </div>
        <button className="button dark" onClick={() => open({ type: "need" })}>
          <Plus size={17} /> Rencana baru
        </button>
      </div>
      <div className="overview-strip">
        <div>
          <span>Dana dialokasikan</span>
          <Money amount={prediction.allocated} />
        </div>
        <div>
          <span>Perkiraan kurang · 30 hari</span>
          <Money amount={prediction.shortfall} />
        </div>
        <div>
          <span>Kebutuhan / hari kerja</span>
          <Money amount={prediction.requiredDaily} />
        </div>
      </div>
      <div className="filter-tabs">
        {[
          ["all", "Semua"],
          ["recurring", "Kebutuhan rutin"],
          ["debt", "Utang"],
          ["goal", "Tabungan"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="plans-grid">
          {visible.map((need) => (
            <NeedCard
              key={need.id}
              need={need}
              onOpen={() => open({ type: "need", need })}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={<Wallet />}
          title="Belum ada rencana di sini"
          action={
            <button
              className="button lime"
              onClick={() => open({ type: "need" })}
            >
              Buat rencana <Plus size={16} />
            </button>
          }
        >
          Atur nominal dan jadwalnya. DanaSiap akan menghitung persiapannya.
        </Empty>
      )}
      <section className="panel advice-panel">
        <CircleHelp size={21} />
        <div>
          <h3>Jadwal boleh berubah. Perhitungan ikut menyesuaikan.</h3>
          <p>
            Buka kebutuhan untuk memajukan atau menundanya. Dana disiapkan
            adalah bagian dari saldo, bukan uang tambahan.
          </p>
        </div>
      </section>
      {state.needs.some((n) => n.paid) && (
        <section className="panel">
          <PanelHeading title="Sudah selesai" />
          {state.needs
            .filter((n) => n.paid)
            .map((n) => (
              <div className="completed-row" key={n.id}>
                <span>
                  <Check size={17} /> {n.title}
                </span>
                <Money amount={n.amount} />
              </div>
            ))}
        </section>
      )}
    </>
  );
}

export function Calendar({ state, open }: PageProps) {
  const today = localDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const start = `${month}-01`;
  const first = new Date(`${start}T12:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  const changeMonth = (n: number) => {
    const d = new Date(`${start}T12:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const records = state.attendance.filter((a) => a.date.startsWith(month));
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">SETIAP HARI SUDAH DIPERHITUNGKAN</span>
          <h1>Kalender kerja</h1>
        </div>
        <button
          className="button dark"
          onClick={() => open({ type: "attendance" })}
        >
          <Plus size={17} /> Catat hari ini
        </button>
      </div>
      <div className="overview-strip">
        <div>
          <span>Masuk tercatat</span>
          <strong>
            {records.filter((a) => !a.planned && a.status === "present").length + records.filter((a) => !a.planned && a.status === "half").length / 2}
            <small> hari</small>
          </strong>
        </div>
        <div>
          <span>Tidak masuk</span>
          <strong>
            {records.filter((a) => !a.planned && a.status === "absent").length}
            <small> hari</small>
          </strong>
        </div>
        <div>
          <span>Pendapatan / hari kerja</span>
          <Money amount={state.profile.dailyIncome} />
        </div>
      </div>
      <section className="panel calendar-panel">
        <div className="panel-heading">
          <h2>
            {new Intl.DateTimeFormat("id-ID", {
              month: "long",
              year: "numeric",
            }).format(first)}
          </h2>
          <div className="calendar-controls">
            <button
              className="icon-button"
              aria-label="Bulan sebelumnya"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="text-button"
              onClick={() => setMonth(today.slice(0, 7))}
            >
              Hari ini
            </button>
            <button
              className="icon-button"
              aria-label="Bulan berikutnya"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => (
            <div className="calendar-weekday" key={day}>
              {day}
            </div>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div className="calendar-spacer" key={`spacer${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            const record = state.attendance.find((a) => a.date === date);
            const work = isWorkday(state, date);
            const holiday = getHoliday(date);
            const needs = state.needs.filter(
              (n) => !n.paid && n.dueDate === date,
            );
            return (
              <button
                key={date}
                className={`calendar-day ${date === today ? "today" : ""} ${!work ? "off" : ""} ${holiday ? "holiday" : ""} ${record?.status === "absent" ? "absent" : ""}`}
                onClick={() => open({ type: "attendance", date })}
                aria-label={`${date}, ${holiday ? holiday + ", " : ""}${record?.planned ? "Rencana belum dikonfirmasi, " : ""}${record?.status === "absent" ? "Tidak masuk" : work ? "Hari kerja" : "Libur"}, ${needs.length} kebutuhan`}
                title={holiday ? `Tanggal Merah: ${holiday}` : undefined}
              >
                <strong>{i + 1}</strong>
                <span>
                  {record?.status === "absent"
                    ? "Tidak masuk"
                    : record?.status === "present"
                      ? record.planned ? "Masuk" : "✓ Masuk"
                      : record?.status === "half"
                        ? "½ hari"
                        : holiday
                          ? holiday
                          : !work
                            ? "Libur"
                            : "Kerja"}
                </span>
                {record?.planned && <small>Rencana</small>}
                {needs.slice(0, 2).map((n) => (
                  <small key={n.id}>{n.title}</small>
                ))}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span>
            <i /> Hari kerja
          </span>
          <span>
            <i className="off" /> Libur mingguan
          </span>
          <span>
            <i className="holiday" /> Tanggal merah resmi
          </span>
          <span>
            <i className="absent" /> Tidak masuk
          </span>
        </div>
      </section>
      <section className="panel advice-panel">
        <CalendarDays size={23} />
        <div>
          <h3>Hari libur tidak dihitung sebagai pemasukan.</h3>
          <p>
            Ketuk tanggal untuk menandai libur pribadi atau perubahan kehadiran.
            Atur hari kerja rutin di pengaturan.
          </p>
        </div>
      </section>
    </>
  );
}

export function Insights({ state, prediction, open }: PageProps) {
  const [scenario, setScenario] = useState("normal");
  const [unexpected, setUnexpected] = useState(100000);
  const today = localDate();
  const simulated =
    scenario === "absent"
      ? forecast(state, { absentDates: [today], horizonDays: 30 })
      : scenario === "unexpected"
        ? forecast(
            {
              ...state,
              transactions: [
                ...state.transactions,
                {
                  id: "simulation",
                  title: "Simulasi",
                  amount: unexpected,
                  type: "expense",
                  category: "Mendadak",
                  date: today,
                },
              ],
            },
            { horizonDays: 30 },
          )
        : prediction;
  const diff = simulated.projectedBalance - prediction.projectedBalance;
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">LIHAT HARI ESOK DARI SEKARANG</span>
          <h1>Statistik & prediksi</h1>
        </div>
        <span className="date-badge">
          <CalendarDays size={16} /> 30 hari ke depan
        </span>
      </div>
      <div className="overview-strip">
        <div>
          <span>Perkiraan pemasukan</span>
          <Money amount={prediction.expectedIncome} />
        </div>
        <div>
          <span>Perkiraan kebutuhan</span>
          <Money amount={prediction.plannedExpenses} />
        </div>
        <div>
          <span>Saldo akhir proyeksi</span>
          <Money amount={prediction.projectedBalance} />
        </div>
      </div>
      <div className="insights-grid">
        <CashChart state={state} />
        <section className="panel simulation-panel">
          <PanelHeading
            title="Kalau begini, gimana?"
            subtitle="Coba skenario tanpa mengubah catatanmu"
          />
          <div className="scenario-buttons">
            <button
              className={scenario === "normal" ? "active" : ""}
              onClick={() => setScenario("normal")}
            >
              Sesuai rencana
            </button>
            <button
              className={scenario === "absent" ? "active" : ""}
              onClick={() => setScenario("absent")}
            >
              Tidak masuk hari ini
            </button>
            <button
              className={scenario === "unexpected" ? "active" : ""}
              onClick={() => setScenario("unexpected")}
            >
              Pengeluaran mendadak
            </button>
          </div>
          {scenario === "unexpected" && (
            <label className="field">
              Nominal pengeluaran (Rp)
              <MoneyInput
                value={unexpected}
                onChange={setUnexpected}
                placeholder="0"
              />
            </label>
          )}
          <div className="simulation-result">
            <span>Perkiraan kekurangan dana</span>
            <Money amount={simulated.shortfall} />
            <p>
              {scenario === "normal" ? (
                "Berdasarkan pola dan jadwalmu saat ini."
              ) : diff === 0 ? (
                scenario === "absent" ? "Tidak ada perubahan dari pemasukan yang diprediksi hari ini." : "Belum ada pengeluaran tambahan dalam simulasi."
              ) : (
                <>
                  Dampak ke saldo akhir: <Money amount={diff} />
                </>
              )}
            </p>
          </div>
          <div className="daily-row">
            <span>Sisa hari kerja</span>
            <strong>{simulated.workdays} hari</strong>
          </div>
        </section>
      </div>
      <section className="panel risk-panel">
        <PanelHeading
          title="Yang perlu diperhatikan"
          subtitle="Kebutuhan yang diprediksi belum terdanai"
        />
        {simulated.risks.length ? (
          simulated.risks.map((risk, index) => (
            <div
              className="risk-row"
              key={`${risk.needId}-${risk.date}-${index}`}
            >
              <span className="risk-icon">
                <ReceiptText size={20} />
              </span>
              <div>
                <h3>{risk.title}</h3>
                <p>
                  <DateLabel date={risk.date} />
                </p>
              </div>
              <div>
                <span>Diprediksi kurang</span>
                <Money amount={risk.shortfall} />
              </div>
              <button
                className="icon-button"
                aria-label={`Lihat ${risk.title}`}
                onClick={() => {
                  const need = state.needs.find((n) => n.id === risk.needId);
                  if (need) open({ type: "need", need });
                }}
              >
                <ArrowUpRight size={20} />
              </button>
            </div>
          ))
        ) : (
          <Empty icon={<Check />} title="Semua kebutuhan terjangkau">
            Dengan data yang ada, belum ada kekurangan dalam 30 hari ke depan.
          </Empty>
        )}
      </section>
      <div className="forecast-note">
        <CircleHelp size={16} />
        <span>
          Pengeluaran harian tetap berjalan saat libur. Prediksi memasukkan
          kebutuhan berulang berikutnya dan menghitung saldo per tanggal.
        </span>
      </div>
    </>
  );
}

export function History({ state, open }: PageProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const entries = [...state.transactions]
    .filter(
      (t) =>
        (filter === "all" || t.type === filter) &&
        `${t.title} ${t.category}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const exportCsv = () => {
    const content =
      "Tanggal,Nama,Jenis,Kategori,Nominal\n" +
      entries
        .map((t) =>
          [t.date, t.title, t.type, t.category, String(t.amount)]
            .map(
              (v) =>
                '"' +
                (v.match(/^[=+@-]/) ? "'" : "") +
                v.replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = `danasiap-transaksi-${localDate()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">JEJAK KECIL, GAMBARAN BESAR</span>
          <h1>Riwayat transaksi</h1>
        </div>
        <button className="button light" onClick={exportCsv}>
          <Download size={17} /> Ekspor CSV
        </button>
      </div>
      <section className="panel">
        <div className="history-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              type="search"
              placeholder="Cari transaksi atau kategori"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <CustomSelect
            ariaLabel="Filter jenis transaksi"
            value={filter}
            onChange={(val) => setFilter(val as string)}
            options={[
              { value: "all", label: "Semua transaksi" },
              { value: "income", label: "Pemasukan" },
              { value: "expense", label: "Pengeluaran" },
            ]}
          />
        </div>
        <div className="transaction-list history-list">
          {entries.length ? (
            entries.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                onClick={() =>
                  open({ type: "transaction-detail", transaction: t })
                }
              />
            ))
          ) : (
            <Empty icon={<Search />} title="Belum ada transaksi yang cocok">
              Coba pencarian lain atau catat transaksi pertamamu.
            </Empty>
          )}
        </div>
      </section>
    </>
  );
}
