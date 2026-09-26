import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  ChevronDown,
  Plus,
  ShoppingBasket,
  Trash2,
  Undo2,
  Zap,
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
  PanelHeading,
} from "./components";
import { TokenPurchaseForm } from "./forms";
import { Collapse, MorphSwap, exitThen, flyTo, useAppear } from "./motion";

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
          <span className="status-pill safe">Wajib aman</span>
        ) : budget.coveredByLeftover ? (
          <span className="status-pill warning">
            Wajib aman kalau pakai <Money amount={budget.shortfall} /> dari Uang
            Sisa
          </span>
        ) : (
          <span className="status-pill shortfall">
            Wajib kurang <Money amount={budget.shortfall} />
          </span>
        )}
      </div>
      <span className="muted">Boleh jajan hari ini</span>
      <Money amount={allowed} className="daily-amount" />
      <p className="budget-sub">
        dari <Money amount={budget.perDay} /> · terpakai{" "}
        <Money amount={budget.spentToday} />
        {budget.leftToday < 0 && (
          <strong className="over">
            {" "}
            · lebih <Money amount={-budget.leftToday} />
          </strong>
        )}
      </p>
      <div className="budget-actions">
        <button className="button lime" onClick={checkPrice}>
          <Scale size={16} /> Cek sebelum beli
        </button>
        <button
          className="button light"
          aria-expanded={details}
          onClick={() => setDetails(!details)}
        >
          {details ? "Tutup hitungan" : "Lihat hitungan"}
          <ChevronDown size={15} className={details ? "rotate-180" : ""} />
        </button>
      </div>
      <Collapse when={details}>
        {(exiting) => (
        <div
          className={`budget-breakdown m-menu m-stagger ${exiting ? "is-exiting" : ""}`}
        >
          <div className="daily-row">
            <span>Uang sekarang</span>
            <Money amount={budget.money} />
          </div>
          {budget.expectedIncome > 0 && (
            <div className="daily-row">
              <span>+ Pemasukan yang masih akan masuk</span>
              <Money amount={budget.expectedIncome} />
            </div>
          )}
          <div className="daily-row">
            <span>− Kebutuhan wajib</span>
            <Money amount={budget.obligations} />
          </div>
          <div className="daily-row">
            <span>− Pengeluaran harian sisa periode</span>
            <Money amount={budget.dailyRemaining} />
          </div>
          {budget.leftoverPot > 0 && (
            <div className="daily-row">
              <span>− Uang sisa (disimpan terpisah)</span>
              <Money amount={budget.leftoverPot} />
            </div>
          )}
          <div className="daily-row total">
            <span>= Uang bebas</span>
            <Money amount={budget.freeMoney} />
          </div>
          {budget.spentToday > 0 && (
            <div className="daily-row">
              <span>+ Jajan hari ini (sudah keluar)</span>
              <Money amount={budget.spentToday} />
            </div>
          )}
          <div className="daily-row">
            <span>÷ {budget.daysLeft} hari (termasuk hari ini)</span>
            <strong>
              <Money amount={budget.perDay} />
              /hari
            </strong>
          </div>
          <div className="dashed-rule" />
          {budget.carryOver > 0 && (
            <div className="daily-row">
              <span>Sisa periode lalu</span>
              <Money amount={budget.carryOver} />
            </div>
          )}
          <div className="daily-row">
            <span>Uang masuk periode ini</span>
            <Money amount={budget.periodIncome} />
          </div>
          {budget.heldForNextPeriod > 0 && (
            <p className="form-hint">
              <Money amount={budget.heldForNextPeriod} /> disimpan untuk periode
              baru.
            </p>
          )}
        </div>
        )}
      </Collapse>
    </section>
  );
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
                <strong>{item.title}</strong>
                <MorphSwap
                  as="span"
                  swapKey={unused ? "unused" : left > 0 ? `left${left}` : "plain"}
                  className={unused ? "positive" : left ? "partial" : ""}
                >
                  {unused ? (
                    <>
                      Nggak dipakai · +<Money amount={left} /> ke uang sisa
                    </>
                  ) : left > 0 ? (
                    <>
                      Terpakai <Money amount={item.amount - left} /> · sisa{" "}
                      <Money amount={left} />
                    </>
                  ) : date > today ? (
                    "Terjadwal"
                  ) : recorded > 0 ? (
                    "Tercatat otomatis"
                  ) : (
                    "Terjadwal"
                  )}
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
                  Nggak dipakai
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
                Ada sisa…
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
                  <Undo2 size={13} /> Batalkan
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
          <p>Uang rencana yang nggak kepakai periode ini</p>
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
          Periode <PeriodLabel {...budget} />
        </small>
      </div>
      <h3 className="dialog-subheading">Masuk periode ini</h3>
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
          <h3 className="dialog-subheading">Periode sebelumnya</h3>
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
                  Uang saat periode ditutup <Money amount={period.endingMoney} />
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
              Jangan dulu, uang wajib jadi kurang{" "}
              <Money amount={result.shortfall} />.
            </p>
          )}
        </div>
      ) : (
        <p className="form-hint">
          Ketik harganya, nanti kelihatan aman atau nggak buat uang wajibmu.
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

function draftShopping(state: AppState): ShoppingDraft[] {
  return (state.shopping?.items ?? []).map((item) => ({
    ...item,
    qty: qtyText(item.qty),
  }));
}

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

export function ShoppingSection({
  state,
  dispatch,
  startRun = false,
}: {
  state: AppState;
  dispatch: Dispatch;
  startRun?: boolean;
}) {
  const [run, setRun] = useState(
    startRun && (state.shopping?.items ?? []).some((i) => !i.skip),
  );
  const [items, setItems] = useState<ShoppingDraft[]>(() =>
    draftShopping(state),
  );
  const [dueDay, setDueDay] = useState(
    state.shopping?.dueDay ?? state.profile.periodStartDay ?? 1,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Saving or finishing replaces the stored list; start editing from it again.
  const [source, setSource] = useState(state.shopping);
  if (source !== state.shopping) {
    setSource(state.shopping);
    setItems(draftShopping(state));
    setDueDay(state.shopping?.dueDay ?? dueDay);
  }
  const parsed = items.map((item) => ({
    ...item,
    qty: parseDecimal(item.qty),
  }));
  const total = shoppingTotal({ items: parsed.map((i) => ({ ...i, qty: Number.isFinite(i.qty) ? i.qty : 0 })), dueDay });
  const saved = state.shopping;
  const update = (itemId: string, changes: Partial<ShoppingDraft>) =>
    setItems(items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)));
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      const clean: ShoppingItem[] = parsed.map((item) => {
        const name = item.name.trim();
        if (!name) throw new Error("Isi nama semua barang belanja.");
        if (!Number.isFinite(item.qty) || item.qty <= 0 || item.qty > 100_000)
          throw new Error(`Jumlah ${name} harus lebih dari 0.`);
        return {
          id: item.id,
          name,
          qty: item.qty,
          price: item.price,
          ...(item.skip ? { skip: true } : {}),
          ...(item.image ? { image: item.image } : {}),
        };
      });
      dispatch({ type: "shopping/set", items: clean, dueDay });
      setError("");
      setMessage("Daftar belanja tersimpan. Totalnya jadi kebutuhan wajib.");
    } catch (err) {
      setMessage("");
      setError(errorText(err));
    }
  };
  const dirty =
    JSON.stringify(parsed.map(({ id, name, qty, price, skip, image }) => [id, name.trim(), qty, price, Boolean(skip), image ?? ""])) !==
      JSON.stringify((saved?.items ?? []).map(({ id, name, qty, price, skip, image }) => [id, name, qty, price, Boolean(skip), image ?? ""])) ||
    dueDay !== (saved?.dueDay ?? dueDay);
  const appear = useAppear(items.map((i) => i.id));
  const running = Boolean(run && saved);
  return (
    <MorphSwap swapKey={running ? "run" : "list"} morph="height">
    {running ? (
      <ShoppingRun
        state={state}
        dispatch={dispatch}
        close={(text) => {
          setRun(false);
          setMessage(text ?? "");
        }}
      />
    ) : (
    <section className="panel shopping-panel">
      <div className="panel-heading">
        <div>
          <h2>Belanja bulanan</h2>
          <p>
            {saved && shoppingTotal(saved) > 0 ? (
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
      {message && (
        <p
          className="form-success m-appear"
          data-fly-target={message.includes("Uang Sisa") ? "pot-note" : undefined}
        >
          {message}
        </p>
      )}
      <form onSubmit={save}>
        {items.length ? (
          <div className="shopping-list">
            {items.map((item, index) => {
              const qty = parsed[index].qty;
              return (
                <div
                  className={`shopping-row ${item.skip ? "skipped" : ""} ${appear(item.id)}`}
                  key={item.id}
                >
                  <label className="field compact shopping-name">
                    Nama barang
                    <input
                      maxLength={100}
                      value={item.name}
                      onChange={(e) => update(item.id, { name: e.target.value })}
                      placeholder="Misalnya, beras 5 kg"
                    />
                  </label>
                  <label className="field compact">
                    Jumlah
                    <input
                      inputMode="decimal"
                      value={item.qty}
                      onChange={(e) => update(item.id, { qty: e.target.value })}
                    />
                  </label>
                  <label className="field compact">
                    Harga satuan (Rp)
                    <MoneyInput
                      value={item.price}
                      onChange={(price) => update(item.id, { price })}
                    />
                  </label>
                  <div className="shopping-row-foot">
                    <ItemPhoto
                      image={item.image}
                      name={item.name}
                      onChange={(image) => update(item.id, { image })}
                    />
                    <Money
                      amount={Number.isFinite(qty) ? Math.round(qty * item.price) : 0}
                    />
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={Boolean(item.skip)}
                        onChange={(e) =>
                          update(item.id, { skip: e.target.checked })
                        }
                      />
                      Masih ada, skip bulan ini
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Hapus ${item.name || "barang"}`}
                      onClick={(e) =>
                        exitThen(e.currentTarget.closest(".shopping-row"), () =>
                          setItems((all) => all.filter((i) => i.id !== item.id)),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="form-hint">
            Belum ada barang. Tambahkan beras, minyak, sabun, dan lainnya.
          </p>
        )}
        <button
          type="button"
          className="button light"
          onClick={() =>
            setItems([
              ...items,
              { id: crypto.randomUUID(), name: "", qty: "1", price: 0 },
            ])
          }
        >
          <Plus size={16} /> Tambah barang
        </button>
        <div className="shopping-summary">
          <div className="daily-row total">
            <span>Total bulan ini</span>
            <Money amount={total} />
          </div>
          <label className="field">
            Tanggal belanja
            <CustomSelect
              value={dueDay}
              onChange={(value) => setDueDay(Number(value))}
              options={Array.from({ length: 28 }, (_, i) => i + 1).map((d) => ({
                value: d,
                label: `Tanggal ${d}`,
              }))}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="budget-actions">
          <button className="button dark" type="submit" disabled={!dirty}>
            Simpan daftar <Check size={16} />
          </button>
          <button
            type="button"
            className="button lime"
            disabled={dirty || !saved || shoppingTotal(saved) === 0}
            title={dirty ? "Simpan daftar dulu sebelum mulai belanja" : undefined}
            onClick={() => {
              setMessage("");
              setRun(true);
            }}
          >
            <ShoppingBasket size={16} /> Mulai belanja
          </button>
        </div>
        {dirty && saved && (
          <p className="form-hint">Simpan daftar dulu sebelum mulai belanja.</p>
        )}
      </form>
    </section>
    )}
    </MorphSwap>
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
                <strong>{row.name}</strong>
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
