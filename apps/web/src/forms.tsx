import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Check,
  Plus,
  Minus,
  CalendarDays,
  BriefcaseBusiness,
  Coffee,
  Wallet,
  Fuel,
  ShieldCheck,
  Camera,
  Trash2,
} from "lucide-react";
import {
  defaultState,
  demoState,
  localDate,
  addDays,
  forecast,
  currency,
  remainingAmount,
  periodBudget,
  checkPurchase,
  isShoppingNeed,
  isElectricityNeed,
  isGasNeed,
  gasEstimate,
  isWorkday,
  isDateKey,
  reducer,
  validateState,
  parseThousands,
  type AppState,
  type Profile,
  type FinancialAction,
  type Need,
  type Attendance,
  spendingImpact,
} from "@danasiap/core";
import { Brand, Money, DateLabel, MoneyInput, CustomSelect, processAvatarFile } from "./components";
import { alertDialog } from "./dialog";
import { Collapse, MorphSwap, TabIndicator } from "./motion";

export const weekLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const id = () => crypto.randomUUID();
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Perubahan belum tersimpan. Coba lagi.";
}
export function validatedProfile(profile: Profile): Profile {
  const name = profile.name.trim();
  if (!name) throw new Error("Isi nama panggilanmu.");
  return validateState({ ...defaultState(), profile: { ...profile, name } })
    .profile;
}
export type DailyItemDraft = {
  id: string;
  title: string;
  amount: number;
  days: number[];
  skipHolidays: boolean;
};
export function draftDailyItems(state: AppState): DailyItemDraft[] {
  return (state.dailyItems ?? []).map(
    ({ id, title, amount, days, skipHolidays }) => ({
      id,
      title,
      amount,
      days: [...days],
      skipHolidays,
    }),
  );
}
/** Friendly checks before the reducer rejects an incomplete daily item. */
export function validatedDailyItems(items: DailyItemDraft[]): DailyItemDraft[] {
  return items.map((item, index) => {
    const title = item.title.trim();
    const label = title || `Pengeluaran harian ke-${index + 1}`;
    if (!title) throw new Error(`Isi nama ${label.toLowerCase()}.`);
    if (title.length > 100) throw new Error(`Nama ${title} terlalu panjang.`);
    if (!item.amount) throw new Error(`Isi nominal per hari untuk ${title}.`);
    if (!item.days.length) throw new Error(`Pilih minimal satu hari untuk ${title}.`);
    return { ...item, title };
  });
}
function DailyItemsEditor({
  items,
  setItems,
}: {
  items: DailyItemDraft[];
  setItems: (items: DailyItemDraft[]) => void;
}) {
  const update = (itemId: string, changes: Partial<DailyItemDraft>) =>
    setItems(
      items.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
    );
  return (
    <fieldset className="field daily-items-field">
      <legend>Pengeluaran harian</legend>
      {items.map((item) => (
        <div className="daily-item-editor" key={item.id}>
          <div className="form-two">
            <label className="field">
              Nama
              <input
                maxLength={100}
                value={item.title}
                onChange={(e) => update(item.id, { title: e.target.value })}
                placeholder="Misalnya, ongkos anak"
              />
            </label>
            <label className="field">
              Nominal per hari (Rp)
              <MoneyInput
                value={item.amount}
                onChange={(amount) => update(item.id, { amount })}
                placeholder="50.000"
              />
            </label>
          </div>
          <div className="week-picker" role="group" aria-label={`Hari ${item.title || "pengeluaran"}`}>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <button
                type="button"
                key={day}
                aria-pressed={item.days.includes(day)}
                className={item.days.includes(day) ? "selected" : ""}
                onClick={() =>
                  update(item.id, {
                    days: item.days.includes(day)
                      ? item.days.filter((d) => d !== day)
                      : [...item.days, day],
                  })
                }
              >
                {weekLabels[day]}
              </button>
            ))}
          </div>
          <div className="daily-item-editor-foot">
            <label className="check-row">
              <input
                type="checkbox"
                checked={item.skipHolidays}
                onChange={(e) =>
                  update(item.id, { skipHolidays: e.target.checked })
                }
              />
              Libur di tanggal merah
            </label>
            <button
              type="button"
              className="text-button danger"
              onClick={() => setItems(items.filter((i) => i.id !== item.id))}
            >
              <Trash2 size={14} /> Hapus
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="button light"
        onClick={() =>
          setItems([
            ...items,
            {
              id: id(),
              title: "",
              amount: 0,
              days: [1, 2, 3, 4, 5],
              skipHolidays: true,
            },
          ])
        }
      >
        <Plus size={16} /> Tambah pengeluaran harian
      </button>
      <small>
        Uang yang keluar rutin tiap hari, misalnya ongkos anak atau uang masak.
        Tercatat otomatis tiap hari terjadwal. Tandai kalau nggak dipakai.
      </small>
    </fieldset>
  );
}
export function ProfileFields({
  profile,
  setProfile,
  items,
  setItems,
}: {
  profile: Profile;
  setProfile: (p: Profile) => void;
  items?: DailyItemDraft[];
  setItems?: (items: DailyItemDraft[]) => void;
}) {
  const working = profile.working !== false;
  return (
    <>
      <div className="avatar-field">
        <div className="avatar-preview-wrap">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt="Foto profil"
              className="avatar-preview-img"
            />
          ) : (
            <span className="avatar-preview-placeholder">
              {profile.name.charAt(0).toUpperCase() || "D"}
            </span>
          )}
        </div>
        <div className="avatar-field-actions">
          <label className="button light avatar-upload-btn">
            <Camera size={15} />
            <span>{profile.avatarUrl ? "Ganti foto profil" : "Unggah foto profil"}</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  try {
                    const avatarUrl = await processAvatarFile(file);
                    setProfile({ ...profile, avatarUrl });
                  } catch (err) {
                    void alertDialog(
                      "Foto belum bisa dipakai",
                      err instanceof Error
                        ? err.message
                        : "Gagal memproses foto profil.",
                    );
                  }
                }
              }}
            />
          </label>
          {profile.avatarUrl && (
            <button
              type="button"
              className="text-button danger"
              onClick={() => setProfile({ ...profile, avatarUrl: undefined })}
            >
              <Trash2 size={14} /> Hapus foto
            </button>
          )}
        </div>
      </div>
      <label className="field">
        Nama panggilan
        <input
          required
          pattern={".*\\S.*"}
          title="Isi nama, bukan hanya spasi."
          maxLength={50}
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          placeholder="Mau dipanggil siapa?"
          autoComplete="given-name"
        />
      </label>
      <fieldset className="field">
        <legend>Apakah kamu bekerja?</legend>
        <div className="segmented m-has-indicator">
          <TabIndicator active={working} />
          {[
            [true, "Bekerja"],
            [false, "Tidak bekerja"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={String(value)}
              aria-pressed={working === value}
              className={working === value ? "selected" : ""}
              onClick={() =>
                setProfile({ ...profile, working: value as boolean })
              }
            >
              {label}
            </button>
          ))}
        </div>
        {!working && (
          <small>
            Absensi, gajian, dan hari kerja disembunyikan. Pemasukan dicatat
            lewat Pemasukan.
          </small>
        )}
      </fieldset>
      <div className="form-two">
        <label className="field">
          Saldo sebelum transaksi dicatat (Rp)
          <MoneyInput
            value={profile.openingBalance}
            onChange={(openingBalance) =>
              setProfile({ ...profile, openingBalance })
            }
            placeholder="0"
          />
          <small>Pengeluaran bertanggal kemarin atau hari ini tetap dikurangi dari angka ini.</small>
        </label>
        {working && <label className="field">
          {profile.payrollCycle === "monthly" ? "Upah pokok / hari kerja (Rp)" : "Pemasukan / hari kerja (Rp)"}
          <MoneyInput
            value={profile.dailyIncome}
            onChange={(dailyIncome) =>
              setProfile({ ...profile, dailyIncome })
            }
            placeholder="70000"
          />
        </label>}
      </div>
      {working && <><div className="form-two">
        <label className="field">
          Sistem Penggajian
          <CustomSelect
            value={profile.payrollCycle ?? "daily"}
            onChange={(val) =>
              setProfile({
                ...profile,
                payrollCycle: val as "daily" | "monthly",
              })
            }
            options={[
              {
                value: "daily",
                label: "Harian (Langsung cair)",
                sublabel: "Uang diterima tiap hari kerja",
              },
              {
                value: "monthly",
                label: "Bulanan (Payroll)",
                sublabel: "Akumulasi cut-off akhir bulan, cair tgl 5–10",
              },
            ]}
          />
        </label>
        {profile.payrollCycle === "monthly" ? (
          <label className="field">
            Tanggal Gajian Bulanan
            <CustomSelect
              value={profile.payday ?? 5}
              onChange={(val) =>
                setProfile({ ...profile, payday: Number(val) })
              }
              options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 28].map((d) => ({
                value: d,
                label: `Tanggal ${d} setiap bulan`,
                sublabel: d === 5 ? "Paling umum / standar" : undefined,
              }))}
            />
          </label>
        ) : null}
      </div>
      <label className="field">
        Tunjangan Aktivitas (Uang Saku Cash per Hari Aktif)
        <MoneyInput
          value={profile.activityAllowance ?? 0}
          onChange={(activityAllowance) =>
            setProfile({ ...profile, activityAllowance })
          }
          placeholder="0"
        />
        <small>
          Diterima cash langsung di tangan saat hari aktif (kuliah/kerja). Hari libur otomatis Rp 0.
        </small>
      </label></>}
      {working && <fieldset className="field">
        <legend>Hari kerja rutin</legend>
        <div className="week-picker">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <button
              type="button"
              key={day}
              aria-pressed={profile.workDays.includes(day)}
              className={profile.workDays.includes(day) ? "selected" : ""}
              onClick={() =>
                setProfile({
                  ...profile,
                  workDays: profile.workDays.includes(day)
                    ? profile.workDays.filter((d) => d !== day)
                    : [...profile.workDays, day],
                })
              }
            >
              {weekLabels[day]}
            </button>
          ))}
        </div>
        <small>Hari yang tidak dipilih diprediksi tanpa pemasukan.</small>
      </fieldset>}
      <label className="field">
        Sebulan mulai tanggal
        <CustomSelect
          value={profile.periodStartDay ?? 1}
          onChange={(val) =>
            setProfile({ ...profile, periodStartDay: Number(val) })
          }
          options={Array.from({ length: 28 }, (_, i) => i + 1).map((d) => ({
            value: d,
            label: `Tanggal ${d}`,
            sublabel:
              d === 1
                ? "Awal bulan kalender"
                : `Sampai tanggal ${d - 1} bulan berikutnya`,
          }))}
        />
        <small>
          Jatah jajan dihitung per periode ini. Pilih tanggal uang bulananmu
          biasanya masuk (gajian atau transferan).
        </small>
        {working && profile.payrollCycle === "monthly" &&
          (profile.periodStartDay ?? 1) !== (profile.payday ?? 5) && (
            <small className="form-warning">
              Tanggal gajianmu {profile.payday ?? 5}. Samakan supaya gaji
              langsung dihitung untuk bulan itu.
            </small>
          )}
      </label>
      {items && setItems && (
        <DailyItemsEditor items={items} setItems={setItems} />
      )}
    </>
  );
}

/** A fresh record with the daily items recorded automatically from today. */
export function initialState(
  profile: Profile,
  items: DailyItemDraft[],
): AppState {
  const today = localDate();
  return validateState({
    ...defaultState(today),
    profile: validatedProfile(profile),
    dailyItems: validatedDailyItems(items).map((item) => ({
      ...item,
      days: [...item.days].sort(),
      since: today,
    })),
  });
}

export function Welcome({
  start,
}: {
  start: (s: AppState, mode?: "personal" | "demo") => void;
}) {
  const [setup, setSetup] = useState(false);
  const [profile, setProfile] = useState(defaultState().profile);
  const [items, setItems] = useState<DailyItemDraft[]>([]);
  const [error, setError] = useState("");
  return (
    <main className="welcome-shell">
      <section className="welcome-art">
        <Brand />
        <div className="welcome-illustration">
          <img
            src="/welcome.png"
            alt="Ilustrasi seseorang menyiapkan uang dalam dompet"
          />
        </div>
        <h1>
          Uang siap.
          <br />
          Hidup lebih{" "}
          <span>
            tenang <ArrowUpRight />
          </span>
        </h1>
        <p>
          Kerja, nabung, dan kebutuhan.
          <br />
          Semuanya ketemu jalannya.
        </p>
        <div className="welcome-art-foot">
          <span>SEDIKIT HARI INI. SIAP ESOK HARI.</span>
        </div>
      </section>
      <section className="welcome-content">
        {!setup ? (
          <>
            <span className="eyebrow">KENALAN DULU, YUK</span>
            <h2>
              Bukan cuma tahu
              <br />
              uang habis ke mana.
            </h2>
            <p>
              Lihat apakah uangmu akan cukup sebelum kebutuhan datang. DanaSiap
              menghitung dari jadwal kerja dan kebiasaanmu.
            </p>
            <div className="welcome-features">
              <div>
                <BriefcaseBusiness />
                <span>Hari kerja jadi dasar rencana</span>
              </div>
              <div>
                <Wallet />
                <span>Utang & kebutuhan disiapkan bareng</span>
              </div>
              <div>
                <CalendarDays />
                <span>Jadwal berubah, hitungan menyesuaikan</span>
              </div>
            </div>
            <button className="button dark" onClick={() => setSetup(true)}>
              Mulai atur uang <ArrowUpRight size={19} />
            </button>
            <button
              className="text-button demo-link"
              onClick={() => start(demoState(), "demo")}
            >
              Lihat contoh dulu <ArrowUpRight size={16} />
            </button>
            <small className="privacy-note">
              <ShieldCheck size={15} /> Bisa dipakai tanpa akun. Catatan
              tersimpan di perangkat ini.
            </small>
          </>
        ) : (
          <>
            <button className="text-button" onClick={() => setSetup(false)}>
              <ArrowLeft size={16} /> Kembali
            </button>
            <h2>Mulai dari harimu.</h2>
            <p>Isi kondisi sekarang. Semuanya bisa diubah nanti.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  start(initialState(profile, items));
                } catch (err) {
                  setError(errorText(err));
                }
              }}
            >
              <ProfileFields
                profile={profile}
                setProfile={setProfile}
                items={items}
                setItems={setItems}
              />
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button className="button dark full" type="submit">
                Buka DanaSiap <ArrowUpRight size={17} />
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export function TransactionForm({
  initialKind = "expense",
  initialFromLeftover = false,
  state,
  monthlyPayroll = false,
  working = true,
  dispatch,
  done,
}: {
  initialKind?: "income" | "expense";
  initialFromLeftover?: boolean;
  state: AppState;
  monthlyPayroll?: boolean;
  working?: boolean;
  dispatch: (a: FinancialAction) => void;
  done: () => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(0);
  // null follows the suggestion; true/false is the user's own choice.
  const [usePot, setUsePot] = useState<boolean | null>(
    initialFromLeftover ? true : null,
  );
  // Money recorded in the last days of a period is usually next month's money.
  const [nextPeriod, setNextPeriod] = useState(() => periodBudget(state).daysLeft <= 3);
  const [error, setError] = useState("");
  const budget = periodBudget(state);
  const pot = Math.max(0, budget.leftoverPot);
  const check = amount > 0 ? checkPurchase(budget, amount) : null;
  const suggested = check?.fromLeftover ?? 0;
  const potOn = kind === "expense" && pot > 0 && (usePot ?? suggested > 0);
  const fromLeftover = !potOn
    ? 0
    : usePot === null
      ? suggested
      : Math.min(pot, amount);
  const ownMoney = amount - fromLeftover;
  // Same timing-aware check as "Cek sebelum beli": later income cannot pay for today.
  const impact = spendingImpact(budget, amount, fromLeftover);
  const perDayAfter = impact.perDayAfter;
  const newPeriodStart = addDays(budget.end, 1);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      if (!amount) throw new Error("Isi nominalnya dulu.");
      dispatch({
        type: "transaction/add",
        transaction: {
          id: id(),
          title: String(data.get("title")).trim(),
          amount,
          type: kind,
          category: String(data.get("category")),
          date: String(data.get("date")),
          ...(kind === "expense" && fromLeftover > 0 ? { fromLeftover } : {}),
          ...(kind === "income" && nextPeriod && budget.daysLeft <= 3
            ? { effectiveDate: newPeriodStart }
            : {}),
        },
      });
      done();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="segmented m-has-indicator">
        <TabIndicator active={kind} />
        <button
          type="button"
          className={kind === "expense" ? "selected" : ""}
          onClick={() => setKind("expense")}
        >
          Pengeluaran
        </button>
        <button
          type="button"
          className={kind === "income" ? "selected" : ""}
          onClick={() => setKind("income")}
        >
          Pemasukan
        </button>
      </div>
      <label className="field amount-field">
        Nominal (Rp)
        <MoneyInput
          autoFocus
          required
          value={amount}
          onChange={setAmount}
          placeholder="0"
        />
      </label>
      <label className="field">
        Untuk apa?
        <input
          name="title"
          required
          maxLength={100}
          placeholder={
            kind === "expense"
              ? "Misalnya, makan siang"
              : "Misalnya, penghasilan tambahan"
          }
        />
      </label>
      <div className="form-two">
        <label className="field">
          Kategori
          <CustomSelect
            name="category"
            key={kind}
            options={
              kind === "expense"
                ? [
                    "Makan",
                    "Transportasi",
                    "Bensin",
                    "Jajan",
                    "Belanja",
                    "Tagihan",
                    "Mendadak",
                    "Lainnya",
                  ]
                : ["Tambahan", "Hadiah", "Lainnya"]
            }
          />
        </label>
        <label className="field">
          Tanggal
          <input
            required
            name="date"
            type="date"
            max={localDate()}
            defaultValue={localDate()}
          />
        </label>
      </div>
      <Collapse when={Boolean(kind === "expense" && pot > 0)}>{() => (
        <div className="pot-toggle">
          <label className="check-row">
            <input
              type="checkbox"
              checked={potOn}
              onChange={(e) => setUsePot(e.target.checked)}
            />
            Ambil dari Uang Sisa
            <span className="muted">
              (ada <Money amount={pot} />)
            </span>
          </label>
          <Collapse when={Boolean(potOn && fromLeftover > 0)}>{() => (
            <small>
              <Money amount={fromLeftover} /> diambil dari Uang Sisa
              {ownMoney > 0 ? (
                <>
                  , <Money amount={ownMoney} /> dari jatah jajan
                </>
              ) : null}
              .
            </small>
          )}</Collapse>
        </div>
      )}</Collapse>
      <Collapse when={Boolean(kind === "expense" && amount > 0 && ownMoney > Math.max(0, budget.leftToday))}>{() => (
        <p className={`budget-hint ${impact.shortfall > 0 || impact.cashShort > 0 ? "bahaya" : "turun"}`}>
          {impact.cashShort > 0 ? (
            <>
              Uangnya belum ada. Yang bisa dipakai sekarang{" "}
              <Money amount={Math.max(0, budget.money - Math.max(0, budget.leftoverPot))} />.
            </>
          ) : impact.shortfall > 0 ? (
            <>
              Uang wajib jadi kurang <Money amount={impact.shortfall} />.
            </>
          ) : budget.daysLeft > 1 ? (
            <>
              Jatah jajan jadi <Money amount={perDayAfter} />
              /hari sampai <DateLabel date={budget.end} />.
            </>
          ) : (
            <>Melebihi jatah hari ini, tapi uang wajib masih aman.</>
          )}
        </p>
      )}</Collapse>
      <Collapse when={Boolean(kind === "income" && budget.daysLeft <= 3)}>{() => (
        <label className="check-row pot-toggle">
          <input
            type="checkbox"
            checked={nextPeriod}
            onChange={(e) => setNextPeriod(e.target.checked)}
          />
          <span>
            Untuk periode baru (mulai <DateLabel date={newPeriodStart} />)
          </span>
        </label>
      )}</Collapse>
      <Collapse when={Boolean(kind === "income" && working)}>{() => (
        <p className="form-hint">
          {monthlyPayroll
            ? "Pendapatan kerja dicatat lewat kehadiran. Kalau mencatat gaji yang sudah cair, sertakan kata ‘gaji’ pada nama agar prediksi tidak menghitungnya dua kali."
            : "Pendapatan kerja dicatat lewat kehadiran agar tidak terhitung dua kali."}
        </p>
      )}</Collapse>
      <Collapse when={Boolean(error)}>{() => (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}</Collapse>
      <button className="button dark full" type="submit">
        Simpan transaksi <Check size={17} />
      </button>
    </form>
  );
}

export function TokenPurchaseForm({
  defaultAmount = 0,
  dispatch,
  done,
}: {
  defaultAmount?: number;
  dispatch: (a: FinancialAction) => void;
  done: () => void;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [kwh, setKwh] = useState("");
  const [date, setDate] = useState(localDate());
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!amount) throw new Error("Isi nominal token yang dibeli.");
      const kwhValue = kwh.trim() ? Number(kwh.replace(",", ".")) : undefined;
      if (kwhValue !== undefined && (!Number.isFinite(kwhValue) || kwhValue <= 0))
        throw new Error("kWh dari struk harus angka lebih dari 0.");
      dispatch({
        type: "electricity/purchase",
        purchase: {
          id: id(),
          date,
          amount,
          ...(kwhValue !== undefined ? { kwh: kwhValue } : {}),
        },
      });
      setAmount(defaultAmount);
      setKwh("");
      setError("");
      done();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="form-two">
        <label className="field">
          Nominal token (Rp)
          <MoneyInput value={amount} onChange={setAmount} placeholder="100.000" />
        </label>
        <label className="field">
          kWh dari struk (opsional)
          <input
            inputMode="decimal"
            value={kwh}
            onChange={(e) => setKwh(e.target.value)}
            placeholder="Misalnya, 66,8"
          />
        </label>
      </div>
      <label className="field">
        Tanggal beli
        <input
          type="date"
          required
          max={localDate()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <p className="form-hint">
        Dicatat sebagai pengeluaran listrik dan dipakai untuk memperkirakan
        pembelian berikutnya.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button dark full" type="submit">
        Catat beli token <Check size={17} />
      </button>
    </form>
  );
}

export const GAS_SIZES = [3, 5.5, 12] as const;
export const gasSizeText = (size: number) =>
  `${size.toLocaleString("id-ID")} kg`;

export function GasPurchaseForm({
  defaultAmount = 0,
  defaultSize,
  dispatch,
  done,
}: {
  defaultAmount?: number;
  defaultSize?: number;
  dispatch: (a: FinancialAction) => void;
  done: (amount: number) => void;
}) {
  const initialSize =
    defaultSize !== undefined && (GAS_SIZES as readonly number[]).includes(defaultSize)
      ? defaultSize
      : 3;
  const [amount, setAmount] = useState(defaultAmount);
  const [size, setSize] = useState<number>(initialSize);
  const [count, setCount] = useState("1");
  const [date, setDate] = useState(localDate());
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!amount || amount <= 0) throw new Error("Isi harga gas yang dibayar.");
      const countValue = Number(count.trim());
      if (!Number.isInteger(countValue) || countValue < 1 || countValue > 20)
        throw new Error("Jumlah tabung harus 1 sampai 20.");
      dispatch({
        type: "gas/purchase",
        purchase: { id: id(), date, amount, size, count: countValue },
      });
      setAmount(defaultAmount);
      setCount("1");
      setError("");
      done(amount);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="segmented m-has-indicator">
        <TabIndicator active={size} />
        {GAS_SIZES.map((value) => (
          <button
            key={value}
            type="button"
            className={size === value ? "selected" : ""}
            onClick={() => setSize(value)}
          >
            {gasSizeText(value)}
          </button>
        ))}
      </div>
      <div className="form-two">
        <label className="field">
          Harga (Rp)
          <MoneyInput value={amount} onChange={setAmount} placeholder="22.000" />
        </label>
        <label className="field">
          Jumlah tabung
          <input
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
            placeholder="1"
          />
        </label>
      </div>
      <label className="field">
        Tanggal beli
        <input
          type="date"
          required
          max={localDate()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <p className="form-hint">
        Dicatat sebagai pengeluaran gas elpiji dan dipakai untuk memperkirakan
        kapan harus beli lagi.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button dark full" type="submit">
        Catat beli gas <Check size={17} />
      </button>
    </form>
  );
}

export function NeedForm({
  dispatch,
  done,
  state,
}: {
  dispatch: (a: FinancialAction) => void;
  done: () => void;
  state: AppState;
}) {
  const [kind, setKind] = useState<Need["kind"]>("recurring");
  const [error, setError] = useState("");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      dispatch({
        type: "need/add",
        need: {
          id: id(),
          title: String(data.get("title")).trim(),
          amount: parseThousands(String(data.get("amount"))),
          saved: parseThousands(String(data.get("saved") || 0)),
          dueDate: String(data.get("date")),
          kind,
          priority: data.get("priority") as Need["priority"],
          ...(kind === "recurring"
            ? { intervalDays: Number(data.get("interval")) }
            : {}),
        },
      });
      done();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="segmented m-has-indicator">
        <TabIndicator active={kind} />
        {[
          ["recurring", "Rutin"],
          ["debt", "Utang"],
          ["goal", "Tabungan"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={kind === value ? "selected" : ""}
            onClick={() => setKind(value as Need["kind"])}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        Nama kebutuhan
        <input
          autoFocus
          required
          maxLength={100}
          name="title"
          placeholder={
            kind === "recurring"
              ? "Bensin motor"
              : kind === "debt"
                ? "Utang jatuh tempo"
                : "Dana darurat"
          }
        />
      </label>
      <div className="form-two">
        <label className="field">
          Target nominal (Rp)
          <MoneyInput
            required
            name="amount"
            placeholder="100.000"
          />
        </label>
        <label className="field">
          Sudah disiapkan (Rp)
          <MoneyInput
            name="saved"
            placeholder="0"
          />
        </label>
      </div>
      <p className="form-hint">
        Dana disiapkan diambil dari saldo yang ada, bukan menambah saldo.
      </p>
      <div className="form-two">
        <label className="field">
          {kind === "debt" ? "Jatuh tempo" : "Dibutuhkan tanggal"}
          <input
            type="date"
            required
            name="date"
            defaultValue={addDays(localDate(), 7)}
          />
        </label>
        {kind === "recurring" && (
          <label className="field">
            Berulang setiap (hari)
            <input
              name="interval"
              type="number"
              required
              min="1"
              max="365"
              defaultValue="7"
            />
          </label>
        )}
      </div>
      <label className="field">
        Prioritas
        <CustomSelect
          name="priority"
          defaultValue="essential"
          options={[
            {
              value: "essential",
              label: "Wajib / menunjang kerja",
              sublabel: "Diprioritaskan sebelum kebutuhan lain",
            },
            {
              value: "flexible",
              label: "Fleksibel",
              sublabel: "Bisa ditunda jika anggaran terbatas",
            },
          ]}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button dark full" type="submit">
        Simpan rencana <Check size={17} />
      </button>
    </form>
  );
}

export function NeedDetail({
  need,
  state,
  dispatch,
  done,
  openShopping,
}: {
  need: Need;
  state: AppState;
  dispatch: (a: FinancialAction) => void;
  done: () => void;
  openShopping?: () => void;
}) {
  const [date, setDate] = useState(need.dueDate);
  const [amount, setAmount] = useState(remainingAmount(need));
  const [saved, setSaved] = useState(need.saved);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("schedule");
  const validDate = isDateKey(date);
  const targetForecast = validDate
    ? forecast({
        ...state,
        needs: state.needs.map((n) =>
          n.id === need.id ? { ...n, dueDate: date } : n,
        ),
      })
    : null;
  const shiftDate = (days: number) => {
    if (validDate) setDate(addDays(date, days));
  };
  const act = (a: FinancialAction) => {
    try {
      dispatch(a);
      done();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <>
      <div className="need-detail-amount">
        <span>{need.paid ? "Sudah dibayar" : "Sisa kebutuhan"}</span>
        <Money amount={remainingAmount(need)} />
        <small>
          {need.kind === "recurring"
            ? `Berulang setiap ${need.intervalDays} hari`
            : need.kind === "debt"
              ? "Utang / cicilan"
              : "Target tabungan"}
        </small>
      </div>
      <div className="segmented m-has-indicator">
        <TabIndicator active={tab} />
        <button
          onClick={() => setTab("schedule")}
          className={tab === "schedule" ? "selected" : ""}
        >
          Jadwal
        </button>
        <button
          onClick={() => setTab("fund")}
          className={tab === "fund" ? "selected" : ""}
        >
          Siapkan dana
        </button>
        <button
          onClick={() => setTab("pay")}
          className={tab === "pay" ? "selected" : ""}
        >
          Bayar
        </button>
      </div>
      <MorphSwap swapKey={tab}>
      {tab === "schedule" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "need/reschedule", id: need.id, dueDate: date });
          }}
        >
          <label className="field">
            Tanggal kebutuhan
            <input
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="reschedule-buttons">
            <button
              className="button light"
              type="button"
              disabled={!validDate}
              onClick={() => shiftDate(-1)}
            >
              <Minus size={16} /> Maju 1 hari
            </button>
            <button
              className="button light"
              type="button"
              disabled={!validDate}
              onClick={() => shiftDate(1)}
            >
              <Plus size={16} /> Mundur 1 hari
            </button>
          </div>
          <div className="inline-insight">
            {targetForecast ? (
              <>
                <span>Prediksi kurang setelah perubahan</span>
                <Money amount={targetForecast.shortfall} />
              </>
            ) : (
              <p>Pilih tanggal yang valid untuk melihat prediksi.</p>
            )}
          </div>
          <p className="form-hint">
            Jadwal berikutnya mengikuti tanggal pembayaran aktual untuk
            kebutuhan rutin.
          </p>
          <button
            className="button dark full"
            type="submit"
            disabled={!validDate}
          >
            Simpan jadwal <Check size={17} />
          </button>
        </form>
      ) : tab === "fund" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "need/update", id: need.id, changes: { saved } });
          }}
        >
          <label className="field">
            Total dana yang disiapkan (Rp)
            <MoneyInput
              max={remainingAmount(need)}
              value={saved}
              onChange={setSaved}
              placeholder="0"
            />
          </label>
          <p className="form-hint">
            Ini menandai sebagian saldo untuk {need.title.toLowerCase()}. Tidak
            ada uang keluar saat kamu mengalokasikannya.
          </p>
          <button className="button dark full">
            Simpan alokasi <Check size={17} />
          </button>
        </form>
      ) : isShoppingNeed(need) ? (
        <div>
          <p className="form-hint">
            Belanja bulanan dicatat dari daftar belanja: centang barang yang
            dibeli dan sesuaikan harganya. Kalau lebih hemat, selisihnya masuk
            Uang Sisa.
          </p>
          <button
            className="button dark full"
            type="button"
            onClick={openShopping}
            disabled={!openShopping}
          >
            Mulai belanja <ArrowUpRight size={17} />
          </button>
        </div>
      ) : isElectricityNeed(need) ? (
        <TokenPurchaseForm
          defaultAmount={remainingAmount(need)}
          dispatch={dispatch}
          done={done}
        />
      ) : isGasNeed(need) ? (
        <GasPurchaseForm
          defaultAmount={remainingAmount(need)}
          defaultSize={gasEstimate(state).size}
          dispatch={dispatch}
          done={done}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "need/pay", id: need.id, date: localDate(), amount });
          }}
        >
          <label className="field">
            Bayar sekarang (Rp)
            <MoneyInput
              max={remainingAmount(need)}
              value={amount}
              onChange={setAmount}
              placeholder="0"
            />
          </label>
          <p className="form-hint">
            Pembayaran langsung dicatat sebagai pengeluaran.{" "}
            {need.kind === "recurring"
              ? "Setelah lunas, kebutuhan berikutnya dibuat otomatis."
              : "Bayar sebagian juga bisa."}
          </p>
          <button className="button dark full">
            Konfirmasi pembayaran <ArrowUpRight size={17} />
          </button>
        </form>
      )}
      </MorphSwap>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function AttendanceForm({
  date: initialDate = localDate(),
  state,
  dispatch,
  done,
}: {
  date?: string;
  state: AppState;
  dispatch: (a: FinancialAction) => void;
  done: () => void;
}) {
  const [date, setDate] = useState(
    isDateKey(initialDate) ? initialDate : localDate(),
  );
  const prior = state.attendance.find((a) => a.date === date);
  const fullDayIncome = (entry?: Attendance) =>
    entry?.income !== undefined &&
    (entry.status === "present" || entry.status === "half")
      ? entry.status === "half"
        ? entry.income * 2
        : entry.income
      : state.profile.dailyIncome;
  const [status, setStatus] = useState<
    "present" | "absent" | "holiday" | "half"
  >(() =>
    // An automatic "present" is usually opened to report an absence.
    prior?.auto
      ? "absent"
      : prior?.status || (isWorkday(state, date) ? "present" : "holiday"),
  );
  const [income, setIncome] = useState(fullDayIncome(prior));
  const [deductionPct, setDeductionPct] = useState<number>(0);
  const defaultAllowance = state.profile.activityAllowance ?? 0;
  const [customAllowance, setCustomAllowance] = useState<number>(() =>
    prior?.allowance !== undefined ? prior.allowance : defaultAllowance,
  );
  const [allowancePct, setAllowancePct] = useState<number>(() => {
    if (!defaultAllowance) return 100;
    if (prior?.allowance !== undefined) {
      if (prior.allowance === defaultAllowance) return 100;
      if (prior.allowance === Math.floor(defaultAllowance * 0.75)) return 75;
      if (prior.allowance === Math.floor(defaultAllowance * 0.5)) return 50;
      if (prior.allowance === Math.floor(defaultAllowance * 0.25)) return 25;
      if (prior.allowance === 0) return 0;
      return -1;
    }
    return 100;
  });
  const [error, setError] = useState("");
  const baseline = forecast(state);
  const attendanceAction = (): FinancialAction => {
    if (!isDateKey(date)) throw new Error("Pilih tanggal yang valid.");
    if (
      (status === "present" || status === "half") &&
      (!Number.isSafeInteger(income) ||
        income < 0 ||
        income > 1_000_000_000_000)
    )
      throw new Error(
        "Pendapatan harus rupiah bulat, dari 0 sampai 1 triliun.",
      );
    if (
      status === "half" &&
      state.profile.activityAllowance &&
      (!Number.isSafeInteger(customAllowance) ||
        customAllowance < 0 ||
        customAllowance > 1_000_000_000_000)
    )
      throw new Error(
        "Uang saku harus rupiah bulat, dari 0 sampai 1 triliun.",
      );
    return {
      type: "attendance/record",
      attendance: {
        date,
        status,
        income: status === "present" || status === "half" ? income : 0,
        allowance:
          status === "half" && state.profile.activityAllowance
            ? customAllowance
            : undefined,
      },
    };
  };
  let simulation = baseline;
  let previewError = "";
  try {
    simulation = forecast(reducer(state, attendanceAction()));
  } catch (err) {
    previewError = errorText(err);
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      dispatch(attendanceAction());
      done();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit}>
      <label className="field">
        Tanggal
        <input
          type="date"
          required
          value={date}
          onChange={(e) => {
            const nextDate = e.target.value;
            setDate(nextDate);
            setError("");
            if (!isDateKey(nextDate)) return;
            const next = state.attendance.find((a) => a.date === nextDate);
            setStatus(
              next?.status ||
                (isWorkday(state, nextDate) ? "present" : "holiday"),
            );
            setIncome(fullDayIncome(next));
          }}
        />
      </label>
      <div className="attendance-options">
        {[
          ["present", "Masuk", "1 hari kerja"],
          ["half", "Setengah hari", "½ penghasilan"],
          ["absent", "Tidak masuk", "Tanpa pemasukan"],
          ["holiday", "Libur", "Sudah direncanakan"],
        ].map(([value, label, desc]) => (
          <button
            type="button"
            key={value}
            className={status === value ? "selected" : ""}
            onClick={() => setStatus(value as typeof status)}
          >
            <span>{label}</span>
            <small>{desc}</small>
            {status === value && <Check size={15} />}
          </button>
        ))}
      </div>
      {(status === "present" || status === "half") && (
        <label className="field">
          {status === "half" ? "Upah yang diterima hari ini (Rp)" : "Pendapatan sehari penuh (Rp)"}
          <MoneyInput
            required
            value={income}
            onChange={(val) => {
              setIncome(val);
              setDeductionPct(-1);
            }}
            placeholder="0"
          />
        </label>
      )}
      {status === "half" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", margin: "14px 0" }}>
          <div className="field">
            <span>Pilihan Potongan Gaji Setengah Hari</span>
            <div className="preset-chips cols-4">
              <button
                type="button"
                className={`preset-chip ${deductionPct === 0 ? "selected" : ""}`}
                onClick={() => {
                  setDeductionPct(0);
                  setIncome(state.profile.dailyIncome);
                }}
              >
                <span className="preset-chip-title">100% Utuh</span>
                <span className="preset-chip-desc">{currency(state.profile.dailyIncome)}</span>
              </button>
              <button
                type="button"
                className={`preset-chip ${deductionPct === 25 ? "selected" : ""}`}
                onClick={() => {
                  setDeductionPct(25);
                  setIncome(Math.floor(state.profile.dailyIncome * 0.75));
                }}
              >
                <span className="preset-chip-title">Dapat 75%</span>
                <span className="preset-chip-desc">{currency(Math.floor(state.profile.dailyIncome * 0.75))}</span>
              </button>
              <button
                type="button"
                className={`preset-chip ${deductionPct === 50 ? "selected" : ""}`}
                onClick={() => {
                  setDeductionPct(50);
                  setIncome(Math.floor(state.profile.dailyIncome * 0.5));
                }}
              >
                <span className="preset-chip-title">Dapat 50%</span>
                <span className="preset-chip-desc">{currency(Math.floor(state.profile.dailyIncome * 0.5))}</span>
              </button>
              <button
                type="button"
                className={`preset-chip ${deductionPct === 75 ? "selected" : ""}`}
                onClick={() => {
                  setDeductionPct(75);
                  setIncome(Math.floor(state.profile.dailyIncome * 0.25));
                }}
              >
                <span className="preset-chip-title">Dapat 25%</span>
                <span className="preset-chip-desc">{currency(Math.floor(state.profile.dailyIncome * 0.25))}</span>
              </button>
            </div>
            <small>Atau ketik nominal rupiah bebas di atas sesuai uang yang kamu terima.</small>
          </div>

          {state.profile.activityAllowance ? (
            <div className="field">
              <span>Uang Saku Cash Diterima (Rp)</span>
              <MoneyInput
                value={customAllowance}
                onChange={(val) => {
                  setCustomAllowance(val);
                  setAllowancePct(-1);
                }}
                placeholder="0"
              />
              <div className="preset-chips cols-5">
                <button
                  type="button"
                  className={`preset-chip ${allowancePct === 100 ? "selected" : ""}`}
                  onClick={() => {
                    setAllowancePct(100);
                    setCustomAllowance(state.profile.activityAllowance ?? 0);
                  }}
                >
                  <span className="preset-chip-title">100% Full</span>
                  <span className="preset-chip-desc">{currency(state.profile.activityAllowance ?? 0)}</span>
                </button>
                <button
                  type="button"
                  className={`preset-chip ${allowancePct === 75 ? "selected" : ""}`}
                  onClick={() => {
                    setAllowancePct(75);
                    setCustomAllowance(Math.floor((state.profile.activityAllowance ?? 0) * 0.75));
                  }}
                >
                  <span className="preset-chip-title">75%</span>
                  <span className="preset-chip-desc">{currency(Math.floor((state.profile.activityAllowance ?? 0) * 0.75))}</span>
                </button>
                <button
                  type="button"
                  className={`preset-chip ${allowancePct === 50 ? "selected" : ""}`}
                  onClick={() => {
                    setAllowancePct(50);
                    setCustomAllowance(Math.floor((state.profile.activityAllowance ?? 0) * 0.5));
                  }}
                >
                  <span className="preset-chip-title">50%</span>
                  <span className="preset-chip-desc">{currency(Math.floor((state.profile.activityAllowance ?? 0) * 0.5))}</span>
                </button>
                <button
                  type="button"
                  className={`preset-chip ${allowancePct === 25 ? "selected" : ""}`}
                  onClick={() => {
                    setAllowancePct(25);
                    setCustomAllowance(Math.floor((state.profile.activityAllowance ?? 0) * 0.25));
                  }}
                >
                  <span className="preset-chip-title">25%</span>
                  <span className="preset-chip-desc">{currency(Math.floor((state.profile.activityAllowance ?? 0) * 0.25))}</span>
                </button>
                <button
                  type="button"
                  className={`preset-chip ${allowancePct === 0 ? "selected" : ""}`}
                  onClick={() => {
                    setAllowancePct(0);
                    setCustomAllowance(0);
                  }}
                >
                  <span className="preset-chip-title">0% (Nol)</span>
                  <span className="preset-chip-desc">{currency(0)}</span>
                </button>
              </div>
              <small>Pilih persentase cepat atau ketik langsung nominal rupiah bebas di atas.</small>
            </div>
          ) : null}
        </div>
      )}
      <div className="inline-insight">
        {previewError ? (
          <p role="status">{previewError}</p>
        ) : (
          <>
            <span>
              {status === "absent"
                ? "Dampak bila tidak masuk"
                : "Perkiraan kekurangan dana"}
            </span>
            <Money amount={simulation.shortfall} />
            <p>
              {status === "holiday"
                ? "Libur tidak menghasilkan pemasukan, tapi kebutuhan harian tetap dihitung."
                : simulation.shortfall > baseline.shortfall
                  ? `Kekurangan bertambah ${currency(simulation.shortfall - baseline.shortfall)} dari rencana sebelumnya.`
                  : "Jadwal ini sudah diperhitungkan dalam rencanamu."}
            </p>
          </>
        )}
      </div>
      {isDateKey(date) && date > localDate() ? (
        <p className="form-hint">
          Tanggal mendatang dicatat sebagai rencana dan otomatis dikonfirmasi
          saat harinya tiba.
        </p>
      ) : (
        prior?.planned && (
          <p className="form-hint">
            Ini masih rencana. Simpan untuk mengubahnya; rencana otomatis
            dikonfirmasi saat harinya tiba.
          </p>
        )
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button dark full"
        type="submit"
        disabled={Boolean(previewError)}
      >
        Simpan kehadiran <Check size={17} />
      </button>
    </form>
  );
}
