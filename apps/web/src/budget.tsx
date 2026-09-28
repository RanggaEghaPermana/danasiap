import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  ShoppingBag,
  Check,
  ChevronDown,
  Plus,
  ShoppingBasket,
  Trash2,
  Undo2,
  Zap,
  Flame,
  PiggyBank,
  CalendarDays,
  Scale,
} from "lucide-react";
import {
  addDays,
  checkPurchase,
  currency,
  dailyTransactionId,
  electricityEstimate,
  gasEstimate,
  isScheduled,
  isShoppingNeed,
  localDate,
  periodBudget,
  periodHistory,
  remainingAmount,
  shoppingDueDate,
  shoppingTotal,
  TOKEN_TARIFF,
  type AppState,
  type FinancialAction,
  type Need,
  type ShoppingItem,
  MAX_ITEM_IMAGE,
} from "@danasiap/core";
import {
  CustomSelect,
  DateLabel,
  Empty,
  Money,
  MoneyInput,
  NoMatch,
  PanelHeading,
  SearchField,
  matchesQuery,
} from "./components";
import { confirmDialog } from "./dialog";
import { GasPurchaseForm, TokenPurchaseForm, gasSizeText } from "./forms";
import {
  AnimatedList,
  Collapse,
  Marquee,
  MorphSwap,
  SPRING_MS,
  flyTo,
  reducedMotion,
} from "./motion";

/** Where money set aside ends up: the Uang Sisa card (or, off the dashboard, its note). */
const POT_TARGETS = ["pot", "pot-note"];

type Dispatch = (action: FinancialAction) => void;

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Perubahan belum tersimpan. Coba lagi.";
}

const kwhFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const kwh = (value: number) => `${kwhFormat.format(value)} kWh`;

function parseDecimal(value: string): number {
  return Number(value.replace(",", "."));
}

export function PeriodLabel({
  start,
  end,
  daysLeft,
}: {
  start: string;
  end: string;
  daysLeft: number;
}) {
  return (
    <>
      <DateLabel date={start} /> – <DateLabel date={end} /> ·{" "}
      {daysLeft === 1 ? "hari terakhir" : `${daysLeft} hari lagi`}
    </>
  );
}

/** "Jatah hari ini": today's snack allowance after every obligation. */
export function BudgetCard({
  state,
  checkPrice,
}: {
  state: AppState;
  checkPrice: () => void;
}) {
  const budget = periodBudget(state);
  const [details, setDetails] = useState(false);
  const allowed = Math.max(0, budget.leftToday);
  return (
    <section className="daily-panel panel budget-panel">
      <div className="panel-heading">
        <div>
          <h2>Jatah hari ini</h2>
          <p>
            <PeriodLabel {...budget} />
          </p>
        </div>
        {budget.shortfall === 0 ? (
          <span className="status-pill safe">
            <Marquee>✓ Uang untuk tagihan &amp; kebutuhan cukup</Marquee>
          </span>
        ) : budget.coveredByLeftover ? (
          <span className="status-pill warning">
            <Marquee>
              Cukup, asal pakai <Money amount={budget.shortfall} /> dari Uang
              Sisa
            </Marquee>
          </span>
        ) : (
          <span className="status-pill shortfall">
            <Marquee>
              Uang kurang <Money amount={budget.shortfall} /> untuk tagihan
              &amp; kebutuhan
              {budget.shortfallDate && (
                <>
                  {" "}
                  (mulai <DateLabel date={budget.shortfallDate} />)
                </>
              )}
            </Marquee>
          </span>
        )}
      </div>
      <span className="muted">Bisa dipakai jajan hari ini</span>
      <Money amount={allowed} className="daily-amount" />
      <p className="budget-sub">
        Jatah <Money amount={budget.perDay} /> · sudah dipakai{" "}
        <Money amount={budget.spentToday} />
      </p>
      <Collapse when={budget.leftToday < 0}>
        {(exiting) => (
          <p className={`budget-sub over-line m-appear m-close ${exiting ? "is-exiting" : ""}`}>
            <strong className="over">
              Kelebihan <Money amount={Math.max(0, -budget.leftToday)} /> dari
              jatah hari ini
            </strong>
          </p>
        )}
      </Collapse>
      <BudgetNote budget={budget} />
      <div className="budget-actions">
        <button className="button lime" onClick={checkPrice}>
          <Scale size={16} /> Cek sebelum beli
        </button>
        <button
          className="button light"
          aria-expanded={details}
          onClick={() => setDetails(!details)}
        >
          <Marquee>{details ? "Tutup rincian" : "Lihat rinciannya"}</Marquee>
          <ChevronDown size={15} className={details ? "rotate-180" : ""} />
        </button>
      </div>
      <Collapse when={details}>
        {(exiting) => (
        <div
          className={`budget-breakdown m-menu m-stagger ${exiting ? "is-exiting" : ""}`}
        >
          <div className="daily-row">
            <span>Uang yang ada sekarang</span>
            <Money amount={budget.money} />
          </div>
          {budget.expectedIncome > 0 && (
            <div className="daily-row">
              <span>+ Uang yang akan masuk (gaji/upah)</span>
              <Money amount={budget.expectedIncome} />
            </div>
          )}
          <div className="daily-row">
            <span>
              − Tagihan &amp; kebutuhan sampai <DateLabel date={budget.end} />
            </span>
            <Money amount={budget.obligations} />
          </div>
          <div className="daily-row">
            <span>
              − Ongkos &amp; uang harian sampai <DateLabel date={budget.end} />
            </span>
            <Money amount={budget.dailyRemaining} />
          </div>
          {budget.reservedAfterPeriod > 0 && (
            <div className="daily-row">
              <span>− Disimpan untuk kebutuhan sebelum uang berikutnya masuk</span>
              <Money amount={budget.reservedAfterPeriod} />
            </div>
          )}
          {budget.leftoverPot > 0 && (
            <div className="daily-row">
              <span>− Uang Sisa (disimpan terpisah)</span>
              <Money amount={budget.leftoverPot} />
            </div>
          )}
          <div className="daily-row total">
            <span>
              {budget.freeMoney < 0 ? "= Kurang sampai " : "= Sisa untuk jajan sampai "}
              <DateLabel date={budget.end} />
            </span>
            <Money amount={budget.freeMoney} />
          </div>
          {budget.spentToday > 0 && (
            <div className="daily-row">
              <span>+ Jajan hari ini (sudah keluar)</span>
              <Money amount={budget.spentToday} />
            </div>
          )}
          <div className="daily-row">
            <span>
              {budget.cashLimitedUntil || (budget.perDay === 0 && budget.freeMoney > 0)
                ? "Jatah jajan per hari (dari uang yang sudah ada)"
                : `Jatah jajan per hari (dibagi ${budget.daysLeft} hari)`}
            </span>
            <strong>
              <Money amount={budget.perDay} />
              /hari
            </strong>
          </div>
          <div className="daily-row">
            <span>Bisa dipakai sekarang tanpa ganggu tagihan</span>
            <Money amount={budget.safeNow} />
          </div>
          {budget.nextPeriodIncome && (
            <p className="form-hint">
              Gaji ± <Money amount={budget.nextPeriodIncome.amount} /> tanggal{" "}
              <DateLabel date={budget.nextPeriodIncome.date} /> masuk di akhir
              bulan ini, jadi dihitung untuk bulan berikutnya.
            </p>
          )}
          <div className="dashed-rule" />
          {budget.carryOver > 0 && (
            <div className="daily-row">
              <span>Sisa dari bulan lalu</span>
              <Money amount={budget.carryOver} />
            </div>
          )}
          <div className="daily-row">
            <span>Uang masuk bulan ini</span>
            <Money amount={budget.periodIncome} />
          </div>
          {budget.heldForNextPeriod > 0 && (
            <p className="form-hint">
              <Money amount={budget.heldForNextPeriod} /> disimpan untuk bulan
              berikutnya.
            </p>
          )}
        </div>
        )}
      </Collapse>
    </section>
  );
}

/** One line that explains a zero or limited allowance, so the number never looks arbitrary. */
function BudgetNote({ budget }: { budget: ReturnType<typeof periodBudget> }) {
  if (budget.shortfall > 0) return null;
  const next = budget.nextIncome ?? budget.nextPeriodIncome;
  if (budget.perDay === 0) {
    return (
      <p className="budget-note">
        Belum ada uang untuk jajan.
        {next ? (
          <>
            {" "}
            Uang berikutnya ± <Money amount={next.amount} /> masuk{" "}
            <DateLabel date={next.date} />.
          </>
        ) : (
          " Catat uang masuk begitu uang bulanan datang."
        )}
      </p>
    );
  }
  if (budget.cashLimitedUntil) {
    return (
      <p className="budget-note">
        Jatah dijaga dari uang yang sudah ada. Naik lagi setelah uang masuk{" "}
        <DateLabel date={budget.cashLimitedUntil} />.
      </p>
    );
  }
  return null;
}

/** Daily items scheduled on one date, with the "not used / leftover" actions. */
export function DailyItemsDay({
  state,
  date,
  dispatch,
  onEmpty,
}: {
  state: AppState;
  date: string;
  dispatch: Dispatch;
  onEmpty?: () => void;
}) {
  const today = localDate();
  const [editing, setEditing] = useState<string | null>(null);
  const [leftover, setLeftover] = useState(0);
  const [error, setError] = useState("");
  const entries = (state.dailyItems ?? [])
    .map((item) => {
      const recorded = state.transactions.find(
        (t) => t.id === dailyTransactionId(item.id, date),
      );
      const left =
        (state.leftovers ?? []).find(
          (l) => l.itemId === item.id && l.date === date,
        )?.amount ?? 0;
      return {
        item,
        recorded: recorded?.amount ?? 0,
        leftover: left,
        visible:
          Boolean(recorded) ||
          left > 0 ||
          (isScheduled(item, date) && date >= item.since),
      };
    })
    .filter((entry) => entry.visible);
  const act = (
    action: FinancialAction,
    fly?: { from: Element | null; amount: number },
  ) => {
    try {
      dispatch(action);
      setError("");
      setEditing(null);
      // Pattern 8: the money that was not used flies to Uang Sisa.
      if (fly && fly.amount > 0)
        flyTo(fly.from, `+${currency(fly.amount)}`, POT_TARGETS);
    } catch (err) {
      setError(errorText(err));
    }
  };
  if (!entries.length)
    return (state.dailyItems ?? []).length ? (
      <p className="form-hint daily-items-empty">
        Nggak ada pengeluaran harian terjadwal di tanggal ini.
      </p>
    ) : (
      <Empty
        icon={<CalendarDays />}
        title="Belum ada pengeluaran harian"
        action={
          onEmpty && (
            <button className="button lime" onClick={onEmpty}>
              Atur di pengaturan <ArrowUpRight size={16} />
            </button>
          )
        }
      >
        Tambahkan uang yang keluar rutin, misalnya ongkos anak atau uang masak.
        Nanti tercatat otomatis tiap hari.
      </Empty>
    );
  return (
    <div className="daily-items-list">
      {entries.map(({ item, recorded, leftover: left }) => {
        const unused = left >= item.amount;
        return (
          <div className="daily-item-row" key={item.id}>
            <div className="daily-item-main">
              <div className="daily-item-info">
                <strong>
                  <Marquee>{item.title}</Marquee>
                </strong>
                <MorphSwap
                  as="span"
                  swapKey={unused ? "unused" : left > 0 ? `left${left}` : "plain"}
                  className={unused ? "positive" : left ? "partial" : ""}
                >
                  <Marquee>
                    {unused ? (
                      <>
                        Tidak dipakai · <Money amount={left} /> masuk Uang Sisa
                      </>
                    ) : left > 0 ? (
                      <>
                        Terpakai <Money amount={item.amount - left} /> ·{" "}
                        <Money amount={left} /> masuk Uang Sisa
                      </>
                    ) : date > today ? (
                      "Terjadwal"
                    ) : recorded > 0 ? (
                      "Tercatat otomatis"
                    ) : (
                      "Terjadwal"
                    )}
                  </Marquee>
                </MorphSwap>
              </div>
              <Money amount={item.amount} />
            </div>
            <div className="daily-item-actions m-stagger">
              {!unused && (
                <button
                  className="chip-button"
                  onClick={(e) =>
                    act(
                      {
                        type: "daily/leftover",
                        itemId: item.id,
                        date,
                        amount: item.amount,
                      },
                      { from: e.currentTarget, amount: item.amount - left },
                    )
                  }
                >
                  <Marquee>Nggak dipakai</Marquee>
                </button>
              )}
              <button
                className={`chip-button ${editing === item.id ? "selected" : ""}`}
                onClick={() => {
                  setEditing(editing === item.id ? null : item.id);
                  setLeftover(left && !unused ? left : 0);
                  setError("");
                }}
              >
                <Marquee>Ada sisa</Marquee>
              </button>
              {left > 0 && (
                <button
                  className="chip-button"
                  onClick={() =>
                    act({
                      type: "daily/leftover",
                      itemId: item.id,
                      date,
                      amount: 0,
                    })
                  }
                >
                  <Undo2 size={13} /> <Marquee>Batalkan</Marquee>
                </button>
              )}
            </div>
            <Collapse when={editing === item.id}>
              {(exiting) => (
              <form
                className={`leftover-inline m-menu m-stagger ${exiting ? "is-exiting" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  act(
                    {
                      type: "daily/leftover",
                      itemId: item.id,
                      date,
                      amount: leftover,
                    },
                    {
                      from: e.currentTarget.querySelector("button"),
                      amount: leftover - left,
                    },
                  );
                }}
              >
                <label className="field compact">
                  Sisa yang nggak kepakai (Rp)
                  <MoneyInput
                    autoFocus
                    value={leftover}
                    onChange={setLeftover}
                    max={item.amount}
                    placeholder="0"
                  />
                </label>
                <button className="button lime" type="submit">
                  Simpan
                </button>
              </form>
              )}
            </Collapse>
          </div>
        );
      })}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function DailyTodayPanel({
  state,
  dispatch,
  openSettings,
}: {
  state: AppState;
  dispatch: Dispatch;
  openSettings: () => void;
}) {
  return (
    <section className="panel daily-items-panel">
      <PanelHeading
        title="Pengeluaran hari ini"
        subtitle="Tercatat otomatis. Tandai kalau nggak dipakai."
      />
      <DailyItemsDay
        state={state}
        date={localDate()}
        dispatch={dispatch}
        onEmpty={openSettings}
      />
    </section>
  );
}

export function PotPanel({
  state,
  view,
  use,
}: {
  state: AppState;
  view: () => void;
  use: () => void;
}) {
  const budget = periodBudget(state);
  const pot = Math.max(0, budget.leftoverPot);
  return (
    <section className="panel pot-panel">
      <div className="panel-heading">
        <div>
          <h2>Uang Sisa</h2>
          <p>Uang yang nggak jadi dipakai, misal ongkos saat anak libur</p>
        </div>
        <span className="pot-icon">
          <PiggyBank size={20} />
        </span>
      </div>
      <Money amount={pot} className="daily-amount" hold="pot" flyTarget="pot" />
      {budget.leftoverUsed > 0 && (
        <p className="budget-sub">
          Sudah dipakai <Money amount={budget.leftoverUsed} />
        </p>
      )}
      <div className="budget-actions">
        <button className="button light" onClick={view}>
          Lihat
        </button>
        <button className="button dark" onClick={use} disabled={pot <= 0}>
          Pakai <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}

export function PotDetail({
  state,
  use,
}: {
  state: AppState;
  use: () => void;
}) {
  const budget = periodBudget(state);
  const history = periodHistory(state);
  const pot = Math.max(0, budget.leftoverPot);
  return (
    <div className="pot-detail">
      <div className="need-detail-amount">
        <span>Uang Sisa sekarang</span>
        <Money amount={pot} />
        <small>
          Bulan ini: <PeriodLabel {...budget} />
        </small>
      </div>
      <h3 className="dialog-subheading">Masuk bulan ini</h3>
      {budget.leftovers.length ? (
        <div className="pot-list">
          {budget.leftovers.map((leftover) => (
            <div className="daily-row" key={leftover.id}>
              <span>
                <DateLabel date={leftover.date} /> · {leftover.title}
              </span>
              <strong className="positive">
                +<Money amount={leftover.amount} />
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="form-hint">
          Belum ada. Uang harian yang nggak dipakai atau belanja yang lebih
          hemat akan masuk ke sini.
        </p>
      )}
      <div className="daily-row">
        <span>Sudah dipakai</span>
        <strong>
          −<Money amount={budget.leftoverUsed} />
        </strong>
      </div>
      {history.length > 0 && (
        <>
          <h3 className="dialog-subheading">Bulan-bulan sebelumnya</h3>
          <div className="pot-list">
            {history.map((period) => (
              <div className="pot-history-row" key={period.start}>
                <div className="daily-row">
                  <span>
                    Sisa <DateLabel date={period.start} /> –{" "}
                    <DateLabel date={period.end} />
                  </span>
                  <Money amount={period.leftover} />
                </div>
                <small>
                  Uang saat bulan itu ditutup <Money amount={period.endingMoney} />
                </small>
              </div>
            ))}
          </div>
        </>
      )}
      <button
        className="button dark full"
        onClick={use}
        disabled={pot <= 0}
      >
        Pakai Uang Sisa <ArrowUpRight size={17} />
      </button>
    </div>
  );
}

export function PurchaseCheck({ state }: { state: AppState }) {
  const [amount, setAmount] = useState(0);
  const budget = periodBudget(state);
  const result = amount > 0 ? checkPurchase(budget, amount) : null;
  return (
    <div>
      <label className="field amount-field">
        Harga barangnya (Rp)
        <MoneyInput autoFocus value={amount} onChange={setAmount} />
      </label>
      <div className="daily-row">
        <span>Jatah jajan hari ini</span>
        <Money amount={Math.max(0, budget.leftToday)} />
      </div>
      <div className="daily-row">
        <span>Uang Sisa</span>
        <Money amount={Math.max(0, budget.leftoverPot)} />
      </div>
      <MorphSwap swapKey={result?.verdict ?? "hint"} className="check-swap" morph="height">
      {result ? (
        <div className={`check-result ${result.verdict}`} role="status">
          {result.verdict === "jatah" ? (
            <p>Aman, masih masuk jatah hari ini.</p>
          ) : result.verdict === "sisa" ? (
            <p>
              Aman: <Money amount={result.fromAllowance} /> dari jatah hari ini
              + <Money amount={result.fromLeftover} /> dari Uang Sisa (Uang
              Sisa tinggal <Money amount={result.leftoverAfter} />
              ).
            </p>
          ) : result.verdict === "turun" ? (
            <p>
              Bisa, tapi jatah jajan turun jadi{" "}
              <Money amount={result.perDayAfter} />
              /hari sampai <DateLabel date={budget.end} />.
            </p>
          ) : (
            <p>
              {result.cashShort > 0 ? (
                <>
                  Jangan dulu, uangnya belum ada. Yang bisa dipakai sekarang{" "}
                  <Money amount={result.cashNow} />.
                </>
              ) : (
                <>
                  Jangan dulu, uang untuk tagihan jadi kurang{" "}
                  <Money amount={result.shortfall} />.
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="form-hint">
          Ketik harganya, nanti kelihatan aman atau nggak buat tagihan &amp;
          kebutuhanmu.
        </p>
      )}
      </MorphSwap>
    </div>
  );
}

/** Long holiday: every scheduled day in the range becomes unused. */
export function SkipRangeForm({
  state,
  date,
  dispatch,
}: {
  state: AppState;
  date: string;
  dispatch: Dispatch;
}) {
  const items = state.dailyItems ?? [];
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(addDays(date, 6));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (!items.length) return null;
  const item = items.find((i) => i.id === itemId);
  let days = 0;
  if (item && from && to && from <= to && to <= addDays(from, 366)) {
    for (let d = from; d <= to; d = addDays(d, 1))
      if (isScheduled(item, d) && d >= item.since) days++;
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button[type=submit]");
    try {
      dispatch({ type: "daily/skipRange", itemId, from, to });
      if (item && days) flyTo(button, `+${currency(days * item.amount)}`, POT_TARGETS);
      setError("");
      setMessage(
        `${item?.title ?? "Pengeluaran"} ditandai libur ${days} hari. Uangnya masuk Uang Sisa di tiap harinya.`,
      );
    } catch (err) {
      setMessage("");
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit} className="skip-range">
      <label className="field">
        Pengeluaran
        <CustomSelect
          value={itemId}
          onChange={(value) => setItemId(String(value))}
          options={items.map((i) => ({ value: i.id, label: i.title }))}
        />
      </label>
      <div className="form-two">
        <label className="field">
          Dari
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          Sampai
          <input
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p className="form-hint">
        {item ? (
          <>
            {days} hari terjadwal ditandai nggak dipakai (
            <Money amount={days * item.amount} />
            ).
          </>
        ) : null}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-success">{message}</p>}
      <button className="button dark full" type="submit" disabled={!days}>
        Tandai libur panjang <Check size={17} />
      </button>
    </form>
  );
}

/** Calendar day: daily items, long holiday and needs due on that date. */
export function DaySection({
  state,
  date,
  dispatch,
  openSettings,
}: {
  state: AppState;
  date: string;
  dispatch: Dispatch;
  openSettings?: () => void;
}) {
  const [skip, setSkip] = useState(false);
  return (
    <div className="day-section">
      <h3 className="dialog-subheading">
        Pengeluaran harian · <DateLabel date={date} full />
      </h3>
      <DailyItemsDay
        state={state}
        date={date}
        dispatch={dispatch}
        onEmpty={openSettings}
      />
      {(state.dailyItems ?? []).length > 0 && (
        <>
          <button
            type="button"
            className="text-button day-skip-toggle"
            aria-expanded={skip}
            onClick={() => setSkip(!skip)}
          >
            Libur panjang? Tandai beberapa hari sekaligus
            <ChevronDown size={14} className={skip ? "rotate-180" : ""} />
          </button>
          <Collapse when={skip}>
            {(exiting) => (
              <div className={`m-appear m-close ${exiting ? "is-exiting" : ""}`}>
                <SkipRangeForm state={state} date={date} dispatch={dispatch} />
              </div>
            )}
          </Collapse>
        </>
      )}
    </div>
  );
}

export function DayDetail({
  state,
  date,
  dispatch,
  openNeed,
  openSettings,
}: {
  state: AppState;
  date: string;
  dispatch: Dispatch;
  openNeed: (need?: Need) => void;
  openSettings: () => void;
}) {
  const needs = state.needs.filter((n) => !n.paid && n.dueDate === date);
  return (
    <div>
      <DaySection
        state={state}
        date={date}
        dispatch={dispatch}
        openSettings={openSettings}
      />
      <h3 className="dialog-subheading">Kebutuhan di tanggal ini</h3>
      {needs.length ? (
        <div className="pot-list">
          {needs.map((need) => (
            <button
              className="daily-row day-need"
              key={need.id}
              onClick={() => openNeed(need)}
            >
              <span>{need.title}</span>
              <strong>
                <Money amount={remainingAmount(need)} />{" "}
                <ArrowUpRight size={14} />
              </strong>
            </button>
          ))}
        </div>
      ) : (
        <p className="form-hint">Belum ada kebutuhan di tanggal ini.</p>
      )}
      <button className="button light full" onClick={() => openNeed()}>
        <Plus size={16} /> Rencana baru
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Belanja bulanan
// ---------------------------------------------------------------------------

type ShoppingDraft = Omit<ShoppingItem, "qty"> & { qty: string };

const qtyText = (qty: number) => String(qty).replace(".", ",");


/** Square-crops and compresses a product photo so the whole list stays small enough to sync. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/"))
      return reject(new Error("File harus berupa gambar (JPG, PNG, WebP)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Browser tidak bisa memproses gambar."));
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      for (const quality of [0.75, 0.6, 0.45]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.length <= MAX_ITEM_IMAGE) return resolve(data);
      }
      reject(new Error("Foto terlalu besar. Coba foto lain."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca file gambar."));
    };
    img.src = url;
  });
}

function ItemPhoto({
  image,
  name,
  onChange,
}: {
  image?: string;
  name: string;
  onChange: (image?: string) => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="item-photo-wrap">
      <label className="item-photo" title={image ? "Ganti foto" : "Tambah foto"}>
        {image ? (
          <img src={image} alt={`Foto ${name || "barang"}`} />
        ) : (
          <Camera size={18} aria-label="Tambah foto barang" />
        )}
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              onChange(await shrinkImage(file));
              setError("");
            } catch (err) {
              setError(errorText(err));
            }
          }}
        />
      </label>
      {image && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(undefined)}
        >
          Hapus foto
        </button>
      )}
      {error && <small className="form-error">{error}</small>}
    </div>
  );
}

const blankDraft = (): ShoppingDraft => ({
  id: crypto.randomUUID(),
  name: "",
  qty: "1",
  price: 0,
});

const toDraft = (item: ShoppingItem): ShoppingDraft => ({ ...item, qty: qtyText(item.qty) });

/** Checks one edited item; throws a friendly message when something is missing. */
function cleanShoppingItem(draft: ShoppingDraft): ShoppingItem {
  const name = draft.name.trim();
  if (!name) throw new Error("Isi nama barangnya dulu.");
  const qty = parseDecimal(draft.qty);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100_000)
    throw new Error(`Jumlah ${name} harus lebih dari 0.`);
  return {
    id: draft.id,
    name,
    qty,
    price: draft.price,
    ...(draft.skip ? { skip: true } : {}),
    ...(draft.image ? { image: draft.image } : {}),
  };
}

const sameItem = (a?: ShoppingItem, b?: ShoppingItem) =>
  JSON.stringify(a && [a.name, a.qty, a.price, Boolean(a.skip), a.image ?? ""]) ===
  JSON.stringify(b && [b.name, b.qty, b.price, Boolean(b.skip), b.image ?? ""]);

const upsertItem = (items: ShoppingItem[], item: ShoppingItem) =>
  items.some((i) => i.id === item.id)
    ? items.map((i) => (i.id === item.id ? item : i))
    : [...items, item];

/**
 * Belanja bulanan. The list is for looking and ticking "Skip"; tapping a row opens a form for
 * just that item (morph), and "Simpan" there saves the whole list right away.
 */
export function ShoppingSection({
  state,
  dispatch,
  startRun = false,
}: {
  state: AppState;
  dispatch: Dispatch;
  startRun?: boolean;
}) {
  const saved = state.shopping;
  const items = saved?.items ?? [];
  const dueDay = saved?.dueDay ?? state.profile.periodStartDay ?? 1;
  const total = shoppingTotal(saved);
  const [run, setRun] = useState(startRun && items.some((i) => !i.skip));
  const [editing, setEditing] = useState<{ draft: ShoppingDraft; isNew: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lastEdited = useRef<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const commit = (next: ShoppingItem[], day = dueDay) =>
    dispatch({ type: "shopping/set", items: next, dueDay: day });
  const stored = editing ? items.find((i) => i.id === editing.draft.id) : undefined;
  const draft = editing?.draft;
  const blank = Boolean(draft && !draft.name.trim() && !draft.price && !draft.image);
  let valid: ShoppingItem | null = null;
  try {
    valid = draft ? cleanShoppingItem(draft) : null;
  } catch {
    valid = null;
  }
  const dirty = Boolean(draft && !(editing?.isNew && blank) && !sameItem(valid ?? undefined, stored) );

  // Leaving the page with a complete, changed item saves it, so typed work is never lost.
  const pending = useRef<{ item: ShoppingItem | null; items: ShoppingItem[]; dueDay: number }>({ item: null, items, dueDay });
  pending.current = { item: dirty ? valid : null, items, dueDay };
  useEffect(
    () => () => {
      const { item, items: list, dueDay: day } = pending.current;
      if (!item) return;
      try {
        dispatch({ type: "shopping/set", items: upsertItem(list, item), dueDay: day });
      } catch {
        /* Stays unsaved; nothing else to do while leaving. */
      }
    },
    [],
  );

  const scrollToTop = () => {
    const top = sectionRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0)
      sectionRef.current?.scrollIntoView({
        behavior: reducedMotion() ? "auto" : "smooth",
        block: "start",
      });
  };
  const openItem = (item?: ShoppingItem) => {
    setError("");
    setMessage("");
    setEditing(item ? { draft: toDraft(item), isNew: false } : { draft: blankDraft(), isNew: true });
    scrollToTop();
  };
  const closeEditor = (text = "") => {
    lastEdited.current = editing?.draft.id ?? null;
    setEditing(null);
    setError("");
    setMessage(text);
  };
  // Back in the list, bring the row that was just edited into view.
  useEffect(() => {
    if (editing || !lastEdited.current) return;
    const id = lastEdited.current;
    lastEdited.current = null;
    const timer = setTimeout(() => {
      sectionRef.current
        ?.querySelector(`[data-key="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    }, SPRING_MS);
    return () => clearTimeout(timer);
  }, [editing]);

  const update = (changes: Partial<ShoppingDraft>) =>
    setEditing((current) => current && { ...current, draft: { ...current.draft, ...changes } });
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      const item = cleanShoppingItem(draft);
      commit(upsertItem(items, item));
      closeEditor(`${item.name} tersimpan.`);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const back = async () => {
    if (!draft || !dirty) return closeEditor();
    if (valid) {
      try {
        commit(upsertItem(items, valid));
        return closeEditor(`${valid.name} tersimpan.`);
      } catch (err) {
        return setError(errorText(err));
      }
    }
    const discard = await confirmDialog({
      title: "Buang isian ini?",
      message: "Isian barang ini belum lengkap, jadi belum bisa disimpan.",
      confirmText: "Buang",
      cancelText: "Lanjut isi",
      danger: true,
    });
    if (discard) closeEditor();
  };
  const remove = async () => {
    if (!draft) return;
    const name = stored?.name || draft.name.trim() || "barang ini";
    const ok = await confirmDialog({
      title: `Hapus ${name}?`,
      message: "Barang ini dihapus dari daftar belanja bulanan.",
      confirmText: "Hapus barang",
      danger: true,
    });
    if (!ok) return;
    try {
      commit(items.filter((i) => i.id !== draft.id));
      lastEdited.current = null;
      setEditing(null);
      setError("");
      setMessage(`${name} dihapus dari daftar.`);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const toggleSkip = (item: ShoppingItem) => {
    try {
      commit(items.map((i) => (i.id === item.id ? { ...i, skip: !i.skip } : i)));
      setMessage("");
    } catch (err) {
      setMessage("");
      setError(errorText(err));
    }
  };

  const searching = items.length >= 5;
  const shown = searching ? items.filter((i) => matchesQuery(query, i.name)) : items;
  const running = Boolean(run && saved);
  const draftQty = draft ? parseDecimal(draft.qty) : 0;
  return (
    <div ref={sectionRef} className="shopping-scroll-anchor">
    <MorphSwap
      swapKey={running ? "run" : editing ? `edit:${editing.draft.id}` : "list"}
      morph="height"
    >
    {running ? (
      <ShoppingRun
        state={state}
        dispatch={dispatch}
        close={(text) => {
          setRun(false);
          setMessage(text ?? "");
        }}
      />
    ) : editing && draft ? (
      <section className="panel shopping-panel">
        <button type="button" className="text-button back-button" onClick={() => void back()}>
          <ArrowLeft size={15} /> Daftar belanja
        </button>
        <div className="panel-heading">
          <div>
            <h2>{editing.isNew ? "Tambah barang" : "Ubah barang"}</h2>
            <p>Harga dan jumlah untuk sebulan.</p>
          </div>
        </div>
        <form className="shop-edit" onSubmit={save}>
          <div className="shop-edit-name">
            <ItemPhoto
              image={draft.image}
              name={draft.name}
              onChange={(image) => update({ image })}
            />
            <label className="field">
              Nama barang
              <input
                autoFocus={editing.isNew}
                maxLength={100}
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Misalnya, beras 5 kg"
              />
            </label>
          </div>
          <div className="form-two">
            <label className="field">
              Jumlah
              <input
                inputMode="decimal"
                value={draft.qty}
                onChange={(e) => update({ qty: e.target.value })}
              />
            </label>
            <label className="field">
              Harga satuan (Rp)
              <MoneyInput value={draft.price} onChange={(price) => update({ price })} />
            </label>
          </div>
          <label className="check-row pot-toggle">
            <input
              type="checkbox"
              checked={Boolean(draft.skip)}
              onChange={(e) => update({ skip: e.target.checked })}
            />
            <span>Stok masih ada, skip bulan ini</span>
          </label>
          <div className="daily-row total">
            <span>Total barang ini</span>
            <Money amount={Number.isFinite(draftQty) ? Math.round(draftQty * draft.price) : 0} />
          </div>
          <Collapse when={error || null}>
            {(exiting) => (
              <p className={`form-error m-appear m-close ${exiting ? "is-exiting" : ""}`} role="alert">
                {error}
              </p>
            )}
          </Collapse>
          <button className="button dark full" type="submit">
            Simpan <Check size={16} />
          </button>
          {!editing.isNew && (
            <button type="button" className="text-button danger shop-delete" onClick={() => void remove()}>
              <Trash2 size={14} /> Hapus barang
            </button>
          )}
        </form>
      </section>
    ) : (
    <section className="panel shopping-panel">
      <div className="panel-heading">
        <div>
          <h2>Belanja bulanan</h2>
          <p>
            {saved && total > 0 ? (
              <>
                Jadwal belanja berikutnya{" "}
                <DateLabel date={shoppingDueDate(state)} />
                {saved.lastDone && (
                  <>
                    {" "}
                    · terakhir <DateLabel date={saved.lastDone} />
                  </>
                )}
              </>
            ) : (
              "Catat barang yang rutin dibeli tiap bulan."
            )}
          </p>
        </div>
        <span className="pot-icon">
          <ShoppingBasket size={20} />
        </span>
      </div>
      <Collapse when={message || null}>
        {(exiting) => (
          <p
            className={`form-success m-appear m-close ${exiting ? "is-exiting" : ""}`}
            data-fly-target={message.includes("Uang Sisa") ? "pot-note" : undefined}
          >
            {message}
          </p>
        )}
      </Collapse>
      <div className="shop-summary">
        <div className="daily-row total">
          <span>Total bulan ini</span>
          <Money amount={total} />
        </div>
        <div className="shop-due-row">
          <span>
            <CalendarDays size={15} /> Tanggal belanja
          </span>
          <CustomSelect
            ariaLabel="Tanggal belanja"
            value={dueDay}
            onChange={(value) => {
              try {
                commit(items, Number(value));
              } catch (err) {
                setError(errorText(err));
              }
            }}
            options={Array.from({ length: 28 }, (_, i) => i + 1).map((d) => ({
              value: d,
              label: `Tiap tanggal ${d}`,
            }))}
          />
        </div>
        <button
          type="button"
          className="button lime full"
          disabled={!saved || total === 0}
          onClick={() => {
            setMessage("");
            setRun(true);
          }}
        >
          <ShoppingBasket size={16} /> Mulai belanja
        </button>
      </div>
      <Collapse when={searching} initial={false}>
        {(exiting) => (
          <div className={`m-close ${exiting ? "is-exiting" : ""}`}>
            <SearchField
              className="list-search"
              value={query}
              onChange={setQuery}
              placeholder="Cari barang…"
            />
          </div>
        )}
      </Collapse>
      {items.length ? (
        <AnimatedList items={shown} keyOf={(i) => i.id} className="shop-list">
          {(item) => (
            <div className={`shop-item ${item.skip ? "skipped" : ""}`}>
              <button
                type="button"
                className="shop-item-main"
                onClick={() => openItem(item)}
                aria-label={`Ubah ${item.name}`}
              >
                <span className="shop-thumb">
                  {item.image ? <img src={item.image} alt="" /> : <ShoppingBag size={18} />}
                </span>
                <span className="shop-item-text">
                  <strong>
                    <Marquee>{item.name}</Marquee>
                  </strong>
                  <small>
                    <Marquee>
                      {qtyText(item.qty)} × {currency(item.price)}
                    </Marquee>
                  </small>
                </span>
                <Money amount={Math.round(item.qty * item.price)} className="shop-item-total" />
              </button>
              <button
                type="button"
                className={`chip-button skip-chip ${item.skip ? "selected" : ""}`}
                aria-pressed={Boolean(item.skip)}
                title="Stok masih ada, skip bulan ini"
                onClick={() => toggleSkip(item)}
              >
                <Check size={13} className="skip-check" /> Skip
              </button>
            </div>
          )}
        </AnimatedList>
      ) : (
        <p className="form-hint">
          Belum ada barang. Tambahkan beras, minyak, sabun, dan lainnya.
        </p>
      )}
      <Collapse when={searching && query.trim() && !shown.length ? "nomatch" : null}>
        {(exiting) => (
          <div className={`m-appear m-close ${exiting ? "is-exiting" : ""}`}>
            <NoMatch query={query} />
          </div>
        )}
      </Collapse>
      <Collapse when={!editing && error ? error : null}>
        {(exiting) => (
          <p className={`form-error m-appear m-close ${exiting ? "is-exiting" : ""}`} role="alert">
            {error}
          </p>
        )}
      </Collapse>
      <button type="button" className="button light shop-add" onClick={() => openItem()}>
        <Plus size={16} /> Tambah barang
      </button>
    </section>
    )}
    </MorphSwap>
    </div>
  );
}

function ShoppingRun({
  state,
  dispatch,
  close,
}: {
  state: AppState;
  dispatch: Dispatch;
  close: (message?: string) => void;
}) {
  const list = state.shopping!;
  const [rows, setRows] = useState(() =>
    list.items
      .filter((item) => !item.skip)
      .map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        qty: qtyText(item.qty),
        price: item.price,
        bought: false,
      })),
  );
  const [error, setError] = useState("");
  const active = state.needs.find((n) => isShoppingNeed(n) && !n.paid);
  const plan = active ? remainingAmount(active) : shoppingTotal(list);
  const actual = rows
    .filter((row) => row.bought)
    .reduce((sum, row) => {
      const qty = parseDecimal(row.qty);
      return sum + (Number.isFinite(qty) ? Math.round(qty * row.price) : 0);
    }, 0);
  const update = (id: string, changes: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  const finish = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    try {
      const items = rows.map((row) => {
        const qty = parseDecimal(row.qty);
        if (row.bought && (!Number.isFinite(qty) || qty <= 0))
          throw new Error(`Jumlah ${row.name} harus lebih dari 0.`);
        return {
          id: row.id,
          qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
          price: row.price,
          bought: row.bought,
        };
      });
      dispatch({
        type: "shopping/finish",
        id: crypto.randomUUID(),
        date: localDate(),
        items,
      });
      const diff = plan - actual;
      if (diff > 0) flyTo(button, `+${currency(diff)}`, POT_TARGETS);
      close(
        diff > 0
          ? `Selesai belanja. Lebih hemat ${currency(diff)}, masuk Uang Sisa.`
          : diff < 0
            ? `Selesai belanja. Lebih mahal ${currency(-diff)} dari rencana.`
            : "Selesai belanja. Pas sesuai rencana.",
      );
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <section className="panel shopping-panel">
      <div className="panel-heading">
        <div>
          <h2>Lagi belanja</h2>
          <p>Centang yang sudah masuk keranjang. Harga boleh diubah.</p>
        </div>
        <button className="text-button" onClick={() => close()}>
          Batal
        </button>
      </div>
      <div className="shopping-list">
        {rows.map((row) => {
          const qty = parseDecimal(row.qty);
          return (
            <div
              className={`shopping-row run ${row.bought ? "bought" : ""}`}
              key={row.id}
            >
              <label className="check-row shopping-name">
                <input
                  type="checkbox"
                  checked={row.bought}
                  onChange={(e) => update(row.id, { bought: e.target.checked })}
                />
                {row.image && (
                  <img className="item-thumb" src={row.image} alt="" />
                )}
                <strong>
                  <Marquee>{row.name}</Marquee>
                </strong>
              </label>
              <label className="field compact">
                Jumlah
                <input
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(e) => update(row.id, { qty: e.target.value })}
                />
              </label>
              <label className="field compact">
                Harga satuan (Rp)
                <MoneyInput
                  value={row.price}
                  onChange={(price) => update(row.id, { price })}
                />
              </label>
              <div className="shopping-row-foot">
                <Money
                  amount={Number.isFinite(qty) ? Math.round(qty * row.price) : 0}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="shopping-summary">
        <div className="daily-row total">
          <span>Belanja sejauh ini</span>
          <Money amount={actual} />
        </div>
        <div className="daily-row">
          <span>Rencana</span>
          <Money amount={plan} />
        </div>
        {actual > 0 && (
          <div className="daily-row">
            <span>
              {actual <= plan ? "Sisa dari rencana" : "Lebih dari rencana"}
            </span>
            <strong className={actual <= plan ? "positive" : "over"}>
              <Money amount={Math.abs(plan - actual)} />
            </strong>
          </div>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button dark full"
        onClick={finish}
        disabled={actual <= 0}
      >
        Selesai belanja <Check size={17} />
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Token listrik
// ---------------------------------------------------------------------------

export function ElectricitySection({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch;
}) {
  const estimate = electricityEstimate(state);
  const electricity = state.electricity;
  const purchases = [...(electricity?.purchases ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const [message, setMessage] = useState("");
  return (
    <div className="electricity-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Token listrik</h2>
            <p>Perkiraan dari riwayat beli token dan cek meteran</p>
          </div>
          <span className="pot-icon">
            <Zap size={20} />
          </span>
        </div>
        {estimate.costPerDay === undefined ? (
          <p className="form-hint">
            Catat minimal 2 kali beli token (atau cek meteran 2 kali) supaya
            perkiraan muncul.
          </p>
        ) : (
          <>
            {estimate.daysPerPurchase !== undefined && estimate.typicalAmount > 0 && (
              <p className="electricity-headline">
                <Money amount={estimate.typicalAmount} /> tahan ±{" "}
                {Math.round(estimate.daysPerPurchase)} hari
              </p>
            )}
            <div className="daily-row">
              <span>Biaya listrik</span>
              <strong>
                ± <Money amount={estimate.costPerDay} />
                /hari
              </strong>
            </div>
            {estimate.monthlyCost !== undefined && (
              <div className="daily-row">
                <span>Perkiraan sebulan</span>
                <strong>
                  ± <Money amount={estimate.monthlyCost} />
                </strong>
              </div>
            )}
            {estimate.kwhPerDay !== undefined && (
              <div className="daily-row">
                <span>Pemakaian</span>
                <strong>± {kwh(estimate.kwhPerDay)}/hari</strong>
              </div>
            )}
            {estimate.remainingKwh !== undefined && (
              <div className="daily-row">
                <span>Sisa di meteran (perkiraan)</span>
                <strong>± {kwh(estimate.remainingKwh)}</strong>
              </div>
            )}
            {estimate.nextPurchaseDate && (
              <div className="daily-row">
                <span>Perkiraan habis</span>
                <strong>
                  <DateLabel date={estimate.nextPurchaseDate} />
                  {estimate.daysLeft !== undefined &&
                    ` · ± ${Math.round(estimate.daysLeft)} hari lagi`}
                </strong>
              </div>
            )}
            {estimate.target &&
              (estimate.target.overBudget > 0 ? (
                <div className="check-result bahaya">
                  <p>
                    Lebih <Money amount={estimate.target.overBudget} /> dari
                    jatah.
                    {estimate.target.kwhPerDay !== undefined &&
                      estimate.kwhPerDay !== undefined && (
                        <>
                          {" "}
                          Supaya pas: maksimal ±{" "}
                          {kwh(estimate.target.kwhPerDay)}/hari (sekarang ±{" "}
                          {kwh(estimate.kwhPerDay)})
                          {estimate.target.saveKwhPerDay
                            ? ` → hemat ± ${kwh(estimate.target.saveKwhPerDay)}/hari`
                            : ""}
                          .
                        </>
                      )}
                  </p>
                </div>
              ) : (
                <div className="check-result jatah">
                  <p>
                    Masih dalam jatah (
                    <Money amount={electricity?.monthlyBudget ?? 0} />
                    /bulan).
                  </p>
                </div>
              ))}
          </>
        )}
        {estimate.pricePerKwh !== undefined && (
          <p className="form-hint">
            Harga ± <Money amount={estimate.pricePerKwh} />
            /kWh{" "}
            {estimate.priceFromReceipts
              ? "dari struk token."
              : "dari tarif daya listrik."}
          </p>
        )}
        <h3 className="dialog-subheading">Riwayat beli token</h3>
        {purchases.length ? (
          <div className="pot-list">
            {purchases.map((purchase) => (
              <div className="daily-row" key={purchase.id}>
                <span>
                  <DateLabel date={purchase.date} />
                  {purchase.kwh ? ` · ${kwh(purchase.kwh)}` : ""}
                </span>
                <Money amount={purchase.amount} />
              </div>
            ))}
          </div>
        ) : (
          <p className="form-hint">Belum ada pembelian token.</p>
        )}
      </section>
      <div className="electricity-forms">
        <section className="panel">
          <PanelHeading title="Beli token" />
          {message && <p className="form-success">{message}</p>}
          <TokenPurchaseForm
            defaultAmount={estimate.typicalAmount}
            dispatch={dispatch}
            done={() => setMessage("Pembelian token tercatat.")}
          />
        </section>
        <section className="panel">
          <PanelHeading
            title="Cek meteran"
            subtitle="Lihat sisa kWh di meteran supaya perkiraan lebih tepat"
          />
          <MeterReadingForm dispatch={dispatch} />
        </section>
        <section className="panel">
          <PanelHeading title="Pengaturan listrik" />
          <ElectricitySettingsForm
            key={`${electricity?.monthlyBudget}-${electricity?.power}`}
            state={state}
            dispatch={dispatch}
          />
        </section>
      </div>
    </div>
  );
}

function MeterReadingForm({ dispatch }: { dispatch: Dispatch }) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(localDate());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      const reading = parseDecimal(value);
      if (!value.trim() || !Number.isFinite(reading) || reading < 0)
        throw new Error("Isi sisa kWh yang tertera di meteran.");
      dispatch({ type: "electricity/reading", reading: { date, kwh: reading } });
      setValue("");
      setError("");
      setMessage("Cek meteran tercatat.");
    } catch (err) {
      setMessage("");
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="form-two">
        <label className="field">
          Sisa kWh di meteran
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Misalnya, 42,5"
          />
        </label>
        <label className="field">
          Tanggal
          <input
            type="date"
            required
            max={localDate()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-success">{message}</p>}
      <button className="button light full" type="submit">
        Simpan cek meteran <Check size={17} />
      </button>
    </form>
  );
}

function ElectricitySettingsForm({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch;
}) {
  const [budget, setBudget] = useState(state.electricity?.monthlyBudget ?? 0);
  const [power, setPower] = useState(state.electricity?.power ?? 0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      dispatch({
        type: "electricity/settings",
        monthlyBudget: budget || undefined,
        power: power || undefined,
      });
      setError("");
      setMessage("Pengaturan listrik tersimpan.");
    } catch (err) {
      setMessage("");
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <label className="field">
        Jatah listrik per bulan (Rp)
        <MoneyInput value={budget} onChange={setBudget} placeholder="0" />
        <small>Kosongkan kalau belum mau pakai target.</small>
      </label>
      <label className="field">
        Daya listrik
        <CustomSelect
          value={power}
          onChange={(value) => setPower(Number(value))}
          options={[
            { value: 0, label: "Belum diatur" },
            ...Object.keys(TOKEN_TARIFF).map((va) => ({
              value: Number(va),
              label: `${Number(va).toLocaleString("id-ID")} VA`,
            })),
          ]}
        />
        <small>
          Cuma perlu diisi kalau struk token nggak mencantumkan kWh.
        </small>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-success">{message}</p>}
      <button className="button dark full" type="submit">
        Simpan pengaturan <Check size={17} />
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Gas elpiji
// ---------------------------------------------------------------------------

const monthsFormat = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** "45 hari (1,5 bulan)" — months only once a cylinder lasts a month or more. */
export function gasDaysText(days: number) {
  const rounded = Math.round(days);
  return rounded >= 30
    ? `${rounded} hari (${monthsFormat.format(Math.round((rounded / 30) * 10) / 10)} bulan)`
    : `${rounded} hari`;
}

export function GasSection({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch;
}) {
  const estimate = gasEstimate(state);
  const gas = state.gas;
  const purchases = [...(gas?.purchases ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
  const [message, setMessage] = useState("");
  return (
    <div className="electricity-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Gas elpiji</h2>
            <p>Perkiraan dari riwayat beli tabung gas</p>
          </div>
          <span className="pot-icon">
            <Flame size={20} />
          </span>
        </div>
        {!estimate.purchases ? (
          <p className="form-hint">
            Catat tiap beli gas, DanaSiap hitung 1 tabung tahan berapa lama dan
            kapan harus beli lagi.
          </p>
        ) : (
          <>
            {estimate.daysPerCylinder !== undefined && (
              <p className="electricity-headline">
                1 tabung
                {estimate.size !== undefined
                  ? ` ${gasSizeText(estimate.size)}`
                  : ""}{" "}
                tahan ± {gasDaysText(estimate.daysPerCylinder)}
              </p>
            )}
            {estimate.guessed && (
              <p className="form-hint">
                (perkiraan awal dari ukuran tabung — makin akurat setelah beli
                lagi)
              </p>
            )}
            {estimate.costPerDay !== undefined && (
              <div className="daily-row">
                <span>Biaya gas</span>
                <strong>
                  ± <Money amount={estimate.costPerDay} />
                  /hari
                </strong>
              </div>
            )}
            {estimate.monthlyCost !== undefined && (
              <div className="daily-row">
                <span>Perkiraan sebulan</span>
                <strong>
                  ± <Money amount={estimate.monthlyCost} />
                </strong>
              </div>
            )}
            {estimate.nextPurchaseDate && (
              <div className="daily-row">
                <span>Perkiraan habis</span>
                <strong>
                  <DateLabel date={estimate.nextPurchaseDate} />
                  {estimate.daysLeft !== undefined &&
                    (estimate.daysLeft === 0
                      ? " · hari ini"
                      : ` · ${estimate.daysLeft} hari lagi`)}
                </strong>
              </div>
            )}
            {estimate.target &&
              (estimate.target.overBudget > 0 ? (
                <div className="check-result bahaya">
                  <p>
                    Lebih <Money amount={estimate.target.overBudget} /> dari
                    jatah gas per bulan.
                  </p>
                </div>
              ) : (
                <div className="check-result jatah">
                  <p>
                    Masih dalam jatah (
                    <Money amount={gas?.monthlyBudget ?? 0} />
                    /bulan).
                  </p>
                </div>
              ))}
          </>
        )}
        <h3 className="dialog-subheading">Riwayat beli gas</h3>
        {purchases.length ? (
          <div className="pot-list">
            {purchases.map((purchase) => (
              <div className="daily-row" key={purchase.id}>
                <span>
                  <DateLabel date={purchase.date} />
                  {` · ${purchase.count ?? 1} × ${
                    purchase.size !== undefined ? gasSizeText(purchase.size) : "tabung"
                  }`}
                </span>
                <Money amount={purchase.amount} />
              </div>
            ))}
          </div>
        ) : (
          <p className="form-hint">Belum ada pembelian gas.</p>
        )}
      </section>
      <div className="electricity-forms">
        <section className="panel">
          <PanelHeading title="Beli gas" />
          {message && <p className="form-success">{message}</p>}
          <GasPurchaseForm
            key={`${estimate.typicalAmount}-${estimate.size}`}
            defaultAmount={estimate.typicalAmount}
            defaultSize={estimate.size}
            dispatch={dispatch}
            done={(amount) => setMessage(`Beli gas ${currency(amount)} tercatat.`)}
          />
        </section>
        <section className="panel">
          <PanelHeading title="Pengaturan gas" />
          <GasSettingsForm
            key={`${gas?.monthlyBudget}`}
            state={state}
            dispatch={dispatch}
          />
        </section>
      </div>
    </div>
  );
}

function GasSettingsForm({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch;
}) {
  const [budget, setBudget] = useState(state.gas?.monthlyBudget ?? 0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      dispatch({ type: "gas/settings", monthlyBudget: budget || undefined });
      setError("");
      setMessage("Pengaturan gas tersimpan.");
    } catch (err) {
      setMessage("");
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <label className="field">
        Jatah gas per bulan (Rp)
        <MoneyInput value={budget} onChange={setBudget} placeholder="0" />
        <small>Kosongkan kalau belum mau pakai target.</small>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-success">{message}</p>}
      <button className="button dark full" type="submit">
        Simpan pengaturan <Check size={17} />
      </button>
    </form>
  );
}
