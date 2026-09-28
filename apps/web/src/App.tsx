import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  LayoutDashboard,
  Wallet,
  CalendarDays,
  ChartNoAxesCombined,
  ReceiptText,
  Settings2,
  Bell,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  WifiOff,
  Cloud,
  Check,
  Download,
  Upload,
  LogOut,
  ShieldCheck,
  Info,
  X,
  Menu,
  RefreshCw,
  Lightbulb,
  Camera,
  Trash2,
  ArrowDownLeft,
  Scale,
} from "lucide-react";
import {
  forecast,
  localDate,
  defaultState,
  validateState,
  type AppState,
  type Profile,
} from "@danasiap/core";
import { createCloudSync, type Session } from "@danasiap/sync";
import { useFinance } from "./store";
import {
  Brand,
  DateLabel,
  Money,
  Modal,
  ModalHeading,
  PanelHeading,
  Empty,
  processAvatarFile,
} from "./components";
import { DialogHost, alertDialog, confirmDialog } from "./dialog";
import {
  Dashboard,
  Plans,
  Calendar,
  Insights,
  History,
  type Page,
  type Dialog,
  type PlansTab,
} from "./pages";
import { DaySection, DayDetail, PotDetail, PurchaseCheck } from "./budget";
import {
  MorphSwap,
  Marquee,
  Presence,
  TabIndicator,
  useMorphMenu,
  usePressFeedback,
} from "./motion";
import {
  Welcome,
  TransactionForm,
  NeedForm,
  NeedDetail,
  AttendanceForm,
  ProfileFields,
  validatedProfile,
  validatedDailyItems,
  draftDailyItems,
  initialState,
  type DailyItemDraft,
} from "./forms";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const cloud = (() => {
  try {
    return url && key
      ? createCloudSync<AppState>({
          url,
          publicKey: key,
          validate: validateState,
        })
      : null;
  } catch {
    return null;
  }
})();
const navigation = [
  { id: "home", label: "Beranda", Icon: LayoutDashboard },
  { id: "plans", label: "Rencana", Icon: Wallet },
  { id: "calendar", label: "Kalender kerja", Icon: CalendarDays },
  { id: "insights", label: "Statistik", Icon: ChartNoAxesCombined },
  { id: "history", label: "Riwayat", Icon: ReceiptText },
] as const;

export function App() {
  const finance = useFinance();
  const { state, dispatch } = finance;
  usePressFeedback();
  const [page, setPage] = useState<Page>("home");
  const [plansTab, setPlansTab] = useState<PlansTab>("needs");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    "local" | "saving" | "synced" | "error"
  >("local");
  const [syncError, setSyncError] = useState("");
  const [syncWakeup, setSyncWakeup] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [userMenuOpen]);
  const savedRef = useRef(finance);
  savedRef.current = finance;
  const lastSynced = useRef("");
  const inflight = useRef(false);
  const currentUser = useRef<string | null | undefined>(undefined);
  const prediction = forecast(state, { horizonDays: 30 });
  const today = localDate();
  const notify = (text: string) => {
    setToast(text);
  };
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    const acceptSession = (next: Session | null) => {
      if (!live) return;
      const userId = next?.user.id ?? null;
      if (currentUser.current !== userId) {
        currentUser.current = userId;
        try {
          savedRef.current.activateAccount(userId);
          setSyncError("");
          setSyncStatus("local");
        } catch (error) {
          setSyncStatus("error");
          setSyncError(
            error instanceof Error
              ? error.message
              : "Cadangan akun belum bisa disimpan.",
          );
        }
        lastSynced.current = "";
        setDialog(null);
      }
      setSession(next);
    };
    const unsubscribe = cloud.onAuthStateChange((_event, next) =>
      acceptSession(next),
    );
    // Auth's initial event may arrive before this promise. Do not apply an older session afterwards.
    cloud
      .getSession()
      .then((next) => {
        if (currentUser.current === undefined) acceptSession(next);
      })
      .catch(() => {});
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  const sameOperation = (userId: string, epoch: number) =>
    currentUser.current === userId && savedRef.current.read().epoch === epoch;
  const finishSave = (
    snapshot: { revision: number; userId: string },
    serialized: string,
    epoch: number,
  ) => {
    if (
      !savedRef.current.setCloudRevision(
        snapshot.revision,
        snapshot.userId,
        epoch,
      )
    )
      return;
    lastSynced.current = serialized;
    setSyncStatus(
      JSON.stringify(savedRef.current.read().state) === serialized
        ? "synced"
        : "local",
    );
    setSyncError("");
  };
  const saveCloud = async () => {
    const latest = savedRef.current.read();
    if (
      !cloud ||
      !session ||
      !online ||
      latest.mode === "demo" ||
      latest.owner !== session.user.id ||
      inflight.current
    )
      return;
    inflight.current = true;
    setSyncStatus("saving");
    const serialized = JSON.stringify(latest.state);
    const userId = session.user.id;
    try {
      const snapshot = await cloud.saveSnapshot(
        latest.state,
        latest.revision,
        userId,
      );
      if (!sameOperation(userId, latest.epoch) || snapshot.userId !== userId)
        return;
      finishSave(snapshot, serialized, latest.epoch);
    } catch (error) {
      if (!sameOperation(userId, latest.epoch)) return;
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Sinkronisasi gagal. Data tetap tersimpan di perangkat.",
      );
    } finally {
      inflight.current = false;
      setSyncWakeup((value) => value + 1);
    }
  };
  useEffect(() => {
    if (
      !cloud ||
      !session ||
      finance.owner !== session.user.id ||
      finance.mode === "demo" ||
      !online ||
      syncStatus === "error" ||
      JSON.stringify(state) === lastSynced.current
    )
      return;
    const timer = setTimeout(() => void saveCloud(), 1200);
    return () => clearTimeout(timer);
  }, [
    state,
    finance.revision,
    finance.owner,
    session,
    online,
    syncStatus,
    syncWakeup,
  ]);
  const connectData = async (direction: "upload" | "download") => {
    if (!cloud || !session || inflight.current) return;
    if (!online) {
      notify("Kamu sedang offline. Catatan tetap ada di perangkat.");
      return;
    }
    const before = savedRef.current.read();
    const userId = session.user.id;
    inflight.current = true;
    setSyncStatus("saving");
    try {
      if (direction === "download") {
        const snapshot = await cloud.loadSnapshot();
        if (!sameOperation(userId, before.epoch)) return;
        if (!snapshot) {
          setSyncStatus("local");
          notify(
            "Akun ini belum punya catatan cloud. Unggah catatan perangkat terlebih dahulu.",
          );
          return;
        }
        if (snapshot.userId !== userId)
          throw new Error("Akun berubah saat memuat data. Coba lagi.");
        if (
          !(await confirmDialog({
            title: "Pakai catatan cloud?",
            message:
              "Catatan di perangkat ini akan diganti dengan catatan cloud. Ekspor catatan lokal terlebih dahulu jika ingin menyimpannya.",
            confirmText: "Pakai catatan cloud",
            danger: true,
          }))
        )
          return;
        localStorage.setItem(
          "danasiap.before-cloud",
          JSON.stringify(savedRef.current.read().state),
        );
        lastSynced.current = JSON.stringify(snapshot.data);
        savedRef.current.replace(
          snapshot.data,
          snapshot.revision,
          snapshot.userId,
        );
        setSyncStatus("synced");
        setSyncError("");
        notify("Catatan cloud berhasil dimuat.");
      } else {
        if (before.mode === "demo") {
          notify("Mulai catatan pribadi sebelum menyinkronkan data.");
          return;
        }
        if (before.owner && before.owner !== userId)
          throw new Error(
            "Catatan perangkat ini milik akun lain. Masuk kembali ke akun tersebut atau muat catatan akun yang sekarang.",
          );
        const remote = await cloud.loadSnapshot();
        if (!sameOperation(userId, before.epoch)) return;
        const latest = savedRef.current.read();
        if (remote && latest.owner !== userId)
          throw new Error(
            "Akun ini sudah memiliki data. Gunakan “Muat dari cloud” agar catatan tidak tertimpa.",
          );
        const serialized = JSON.stringify(latest.state);
        const snapshot = await cloud.saveSnapshot(
          latest.state,
          latest.owner === userId ? latest.revision : 0,
          userId,
        );
        if (!sameOperation(userId, latest.epoch) || snapshot.userId !== userId)
          return;
        finishSave(snapshot, serialized, latest.epoch);
        notify("Data tersinkron. Perubahan berikutnya disimpan otomatis.");
      }
    } catch (error) {
      if (sameOperation(userId, before.epoch)) {
        setSyncStatus("error");
        setSyncError(
          error instanceof Error ? error.message : "Gagal menyinkronkan data.",
        );
      }
    } finally {
      inflight.current = false;
      setSyncStatus((value) => (value === "saving" ? "local" : value));
      setSyncWakeup((value) => value + 1);
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const done = () => {
    setDialog(null);
    notify("Tersimpan. Prediksi sudah diperbarui.");
  };
  const exportData = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              exportedAt: new Date().toISOString(),
              state: savedRef.current.read().state,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    a.download = `danasiap-cadangan-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("Cadangan diunduh. Simpan di tempat yang aman.");
  };
  const importData = async (file?: File) => {
    if (!file) return;
    const before = savedRef.current.read();
    const userId = currentUser.current;
    try {
      if (file.size > 5_000_000)
        throw new Error("File terlalu besar. Batas impor 5 MB.");
      const data = JSON.parse(await file.text());
      if (
        data &&
        typeof data === "object" &&
        "version" in data &&
        data.version !== 1
      )
        throw new Error("Versi cadangan belum didukung.");
      const next = validateState(data?.state ?? data?.data ?? data);
      if (
        savedRef.current.read().epoch !== before.epoch ||
        currentUser.current !== userId
      )
        throw new Error(
          "Catatan atau akun berubah saat membaca file. Impor ulang cadangan.",
        );
      if (
        !(await confirmDialog({
          title: "Pulihkan cadangan?",
          message:
            "Catatan di perangkat ini akan diganti dengan cadangan ini. Catatan saat ini disimpan dulu sebagai cadangan pemulihan di perangkat.",
          confirmText: "Pulihkan",
          danger: true,
        }))
      )
        return;
      localStorage.setItem(
        "danasiap.before-import",
        JSON.stringify(savedRef.current.read().state),
      );
      savedRef.current.replace(next);
      lastSynced.current = "";
      setSyncStatus("local");
      setSyncError("");
      notify("Cadangan berhasil dimuat.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "File cadangan tidak valid.",
      );
    }
  };
  const pageProps = {
    state,
    prediction,
    open: setDialog,
    navigate,
    dispatch: finance.dispatch,
    plansTab,
    setPlansTab,
  };
  const openShopping = () => {
    setDialog(null);
    setPlansTab("shop-run");
    navigate("plans");
  };
  if (!finance.initialized) return <Welcome start={finance.start} />;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <button
          className="brand-button"
          onClick={() => navigate("home")}
          aria-label="DanaSiap beranda"
        >
          <Brand />
        </button>
        <span className="sidebar-caption">RUANG KEUANGANMU</span>
        <nav aria-label="Navigasi utama" className="m-has-indicator">
          <TabIndicator active={page} />
          {navigation.map(({ id, label, Icon }) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.6} />
              <span>
                {id === "calendar" && state.profile.working === false
                  ? "Kalender"
                  : label}
              </span>
              {page === id && <ArrowUpRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <div className="sidebar-tip-badge" aria-hidden="true">
            <Lightbulb size={18} />
          </div>
          <h3>
            Sedikit hari ini.
            <br />
            Siap esok hari.
          </h3>
          <p>Setiap catatan kecil bikin rencanamu lebih jelas.</p>
          <button onClick={() => setDialog({ type: "need" })}>
            Siapkan kebutuhan <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} /> Pengaturan
          </button>
          <span className="connection-label">
            {online ? <ShieldCheck size={14} /> : <WifiOff size={14} />}{" "}
            {syncStatus === "synced"
              ? "Tersinkron dengan cloud"
              : online
                ? "Tersimpan di perangkat"
                : "Kamu sedang offline"}
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="greeting">
            <span className="avatar">
              {state.profile.avatarUrl ? (
                <img
                  src={state.profile.avatarUrl}
                  alt={state.profile.name}
                  className="avatar-img"
                />
              ) : (
                state.profile.name.charAt(0).toUpperCase() || "D"
              )}
            </span>
            <div>
              <span>Halo, {state.profile.name || "teman"}</span>
              <strong>Selamat datang kembali</strong>
            </div>
          </div>
          <div className="header-actions">
            <span className="date-badge desktop-only">
              <CalendarDays size={15} />
              <DateLabel date={today} full />
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Peringatan dan pengingat"
              onClick={() => setDialog({ type: "notifications" })}
            >
              <Bell size={19} />
              {prediction.risks.length > 0 && <i />}
            </button>
            <div className="user-menu-wrap desktop-only" ref={userMenuRef}>
              <button
                className={`user-button ${userMenuOpen ? "active" : ""}`}
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="Menu profil"
                aria-expanded={userMenuOpen}
              >
                {state.profile.avatarUrl ? (
                  <img
                    src={state.profile.avatarUrl}
                    alt=""
                    className="user-avatar-img"
                  />
                ) : (
                  <span>
                    {state.profile.name.charAt(0).toUpperCase() || "D"}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={userMenuOpen ? "rotate-180" : ""}
                />
              </button>
              <Presence when={userMenuOpen}>
                {(exiting) => (
                <div
                  className={`user-dropdown-menu m-menu m-stagger ${exiting ? "is-exiting" : ""}`}
                  role="menu"
                >
                  <div className="user-dropdown-header">
                    <div className="user-dropdown-avatar-wrap m-pop">
                      {state.profile.avatarUrl ? (
                        <img
                          src={state.profile.avatarUrl}
                          alt=""
                          className="user-dropdown-avatar"
                        />
                      ) : (
                        <span className="user-dropdown-avatar-fallback">
                          {state.profile.name.charAt(0).toUpperCase() || "D"}
                        </span>
                      )}
                    </div>
                    <div className="user-dropdown-info">
                      <strong>
                        <Marquee>{state.profile.name || "Pengguna"}</Marquee>
                      </strong>
                      <small>
                        {finance.mode === "demo"
                          ? "Mode data contoh"
                          : "Catatan pribadi"}
                      </small>
                    </div>
                  </div>
                  <div className="user-dropdown-divider" />
                  <label className="user-dropdown-item upload-item">
                    <Camera size={16} />
                    <span>Ubah Foto Profil</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const avatarUrl = await processAvatarFile(file);
                            dispatch({
                              type: "profile/update",
                              profile: { avatarUrl },
                            });
                            notify("Foto profil berhasil diperbarui.");
                            setUserMenuOpen(false);
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
                  {state.profile.avatarUrl && (
                    <button
                      className="user-dropdown-item text-danger"
                      onClick={() => {
                        dispatch({
                          type: "profile/update",
                          profile: { avatarUrl: undefined },
                        });
                        notify("Foto profil dihapus.");
                        setUserMenuOpen(false);
                      }}
                    >
                      <Trash2 size={16} />
                      <span>Hapus Foto Profil</span>
                    </button>
                  )}
                  <button
                    className="user-dropdown-item"
                    onClick={() => {
                      navigate("settings");
                      setUserMenuOpen(false);
                    }}
                  >
                    <Settings2 size={16} />
                    <span>Pengaturan & Kebiasaan</span>
                  </button>
                  <button
                    className="user-dropdown-item"
                    onClick={() => {
                      exportData();
                      setUserMenuOpen(false);
                    }}
                  >
                    <Download size={16} />
                    <span>Cadangkan Data</span>
                  </button>
                  {finance.mode === "demo" && (
                    <button
                      className="user-dropdown-item highlight"
                      onClick={() => {
                        setDialog({ type: "setup" });
                        setUserMenuOpen(false);
                      }}
                    >
                      <ArrowUpRight size={16} />
                      <span>Mulai Catatan Pribadi</span>
                    </button>
                  )}
                </div>
                )}
              </Presence>
            </div>
            <button
              className="icon-button mobile-only"
              aria-label="Buka menu"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              {mobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>
        <main className="main-content" data-page={page}>
          {finance.mode === "demo" && (
            <div className="demo-banner">
              <span>
                <Info size={15} />
                <strong>Data contoh</strong>
                <span className="desktop-only">
                  {" "}
                  · Coba fitur tanpa mengubah keuanganmu.
                </span>
              </span>
              <button onClick={() => setDialog({ type: "setup" })}>
                Mulai catatan sendiri <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {finance.storageError && (
            <div role="alert" className="error-banner">
              {finance.storageError}
            </div>
          )}
          {syncStatus === "error" && (
            <div className="error-banner">
              Sinkronisasi tertunda. Data lokal tetap tersimpan.{" "}
              <button onClick={() => navigate("settings")}>Lihat detail</button>
            </div>
          )}
          <MorphSwap swapKey={page} className="page-swap">
          <div className="page-layer" data-page={page}>
          {page === "home" ? (
            <Dashboard {...pageProps} />
          ) : page === "plans" ? (
            <Plans {...pageProps} />
          ) : page === "calendar" ? (
            <Calendar {...pageProps} />
          ) : page === "insights" ? (
            <Insights {...pageProps} />
          ) : page === "history" ? (
            <History {...pageProps} />
          ) : (
            <Settings
              state={state}
              save={(profile, items) => {
                // Check the items first so a bad item never leaves half-saved settings.
                const dailyItems = validatedDailyItems(items);
                finance.dispatch({ type: "profile/update", profile });
                finance.dispatch({ type: "daily/set", items: dailyItems });
                notify("Pengaturan tersimpan.");
              }}
              saveItems={(items) => {
                finance.dispatch({ type: "daily/set", items: validatedDailyItems(items) });
                notify("Pengeluaran harian tersimpan.");
              }}
              session={session}
              cloudReady={Boolean(cloud)}
              syncStatus={syncStatus}
              syncError={syncError}
              signIn={() => setDialog({ type: "auth" })}
              connectData={connectData}
              signOut={async () => {
                try {
                  await cloud?.signOut();
                  finance.activateAccount(null);
                  setSyncStatus("local");
                  notify(
                    "Keluar dari akun. Catatan akun disimpan di perangkat dan dipulihkan saat masuk kembali.",
                  );
                } catch (error) {
                  notify(String(error));
                }
              }}
              exportData={exportData}
              importData={importData}
            />
          )}
          </div>
          </MorphSwap>
          <footer className="app-footer">
            <Brand small />
            <span>Lebih siap, satu hari setiap waktu.</span>
            <span>Asia/Jakarta · IDR</span>
          </footer>
        </main>
      </div>
      <MobileNav
        page={page}
        navigate={navigate}
        openDialog={setDialog}
      />
      <Presence when={dialog ? "dialog" : null}>
        {(exiting) =>
          dialog && (
        <Modal
          exiting={exiting}
          labelledBy="dialog-title"
          close={() => setDialog(null)}
        >
          <MorphSwap
            className="modal-swap"
            resetScroll
            swapKey={
              dialog.type +
              ("need" in dialog ? dialog.need?.id : "") +
              ("date" in dialog ? dialog.date : "")
            }
          >
          <ModalHeading
          id="dialog-title"
          title={
            dialog.type === "transaction"
              ? "Catat transaksi"
              : dialog.type === "need"
                ? dialog.need?.title || "Rencana baru"
                : dialog.type === "attendance"
                  ? "Catat hari kerjamu"
                  : dialog.type === "day"
                    ? new Intl.DateTimeFormat("id-ID", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      }).format(new Date(`${dialog.date}T12:00:00+07:00`))
                    : dialog.type === "pot"
                      ? "Uang Sisa"
                      : dialog.type === "check"
                        ? "Cek sebelum beli"
                  : dialog.type === "notifications"
                    ? "Pengingat untukmu"
                    : dialog.type === "setup"
                      ? "Mulai catatan pribadi"
                      : dialog.type === "auth"
                        ? ""
                        : "Detail transaksi"
          }
          subtitle={
            dialog.type === "transaction"
              ? "Biar pengeluaran kecil pun tetap kelihatan."
              : dialog.type === "need" && !dialog.need
                ? "Siapkan uangnya sebelum hari itu datang."
                : dialog.type === "check"
                  ? "Lihat dulu dampaknya ke jatah jajan dan tagihan."
                  : undefined
          }
          close={() => setDialog(null)}
          />
          {dialog.type === "transaction" ? (
            <TransactionForm
              initialKind={dialog.kind}
              initialFromLeftover={dialog.fromLeftover}
              state={state}
              monthlyPayroll={state.profile.payrollCycle === "monthly"}
              working={state.profile.working !== false}
              dispatch={finance.dispatch}
              done={done}
            />
          ) : dialog.type === "need" ? (
            dialog.need ? (
              <NeedDetail
                need={dialog.need}
                state={state}
                dispatch={finance.dispatch}
                done={done}
                openShopping={openShopping}
              />
            ) : (
              <NeedForm state={state} dispatch={finance.dispatch} done={done} />
            )
          ) : dialog.type === "attendance" ? (
            <>
              <AttendanceForm
                date={dialog.date}
                state={state}
                dispatch={finance.dispatch}
                done={done}
              />
              {dialog.date && (
                <DaySection
                  state={state}
                  date={dialog.date}
                  dispatch={finance.dispatch}
                  openSettings={() => {
                    setDialog(null);
                    navigate("settings");
                  }}
                />
              )}
            </>
          ) : dialog.type === "day" ? (
            <DayDetail
              state={state}
              date={dialog.date}
              dispatch={finance.dispatch}
              openNeed={(need) => setDialog({ type: "need", need })}
              openSettings={() => {
                setDialog(null);
                navigate("settings");
              }}
            />
          ) : dialog.type === "pot" ? (
            <PotDetail
              state={state}
              use={() =>
                setDialog({
                  type: "transaction",
                  kind: "expense",
                  fromLeftover: true,
                })
              }
            />
          ) : dialog.type === "check" ? (
            <PurchaseCheck state={state} />
          ) : dialog.type === "setup" ? (
            <FreshSetup
              start={(s) => {
                finance.start(s);
                setDialog(null);
                navigate("home");
                notify("Catatan pribadimu sudah siap.");
              }}
            />
          ) : dialog.type === "auth" ? (
            <AuthForm
              done={() => {
                setDialog(null);
                navigate("settings");
                notify(
                  "Berhasil masuk. Pilih catatan yang ingin disinkronkan.",
                );
              }}
            />
          ) : dialog.type === "transaction-detail" ? (
            <div className="detail-list">
              <Money
                className="detail-amount"
                amount={dialog.transaction.amount}
              />
              <dl>
                <div>
                  <dt>Nama</dt>
                  <dd>{dialog.transaction.title}</dd>
                </div>
                <div>
                  <dt>Jenis</dt>
                  <dd>
                    {dialog.transaction.type === "income"
                      ? "Pemasukan"
                      : "Pengeluaran"}
                  </dd>
                </div>
                <div>
                  <dt>Kategori</dt>
                  <dd>{dialog.transaction.category}</dd>
                </div>
                <div>
                  <dt>Tanggal</dt>
                  <dd>
                    <DateLabel date={dialog.transaction.date} full />
                  </dd>
                </div>
              </dl>
              {dialog.transaction.attendanceDate && (
                <p className="form-hint">
                  Dibuat dari kehadiran kerja. Perbaiki melalui kalender jika
                  perlu.
                </p>
              )}
              <button
                className="button light full"
                onClick={() => setDialog(null)}
              >
                Selesai
              </button>
            </div>
          ) : (
            <div className="notifications-list">
              {prediction.risks.length ? (
                prediction.risks.slice(0, 6).map((risk, i) => (
                  <div key={`${risk.needId}${i}`}>
                    <span className="risk-icon">
                      <Bell size={18} />
                    </span>
                    <section>
                      <h3>{risk.title} perlu disiapkan</h3>
                      <p>
                        Diprediksi kurang <Money amount={risk.shortfall} /> pada{" "}
                        <DateLabel date={risk.date} />.
                      </p>
                    </section>
                  </div>
                ))
              ) : (
                <Empty icon={<Check />} title="Rencana masih terkendali">
                  Belum ada kebutuhan yang diprediksi kekurangan dana.
                </Empty>
              )}
              <p className="form-hint">
                Pengingat ini memakai data terakhir di perangkat. Pengiriman
                notifikasi Android diatur dari aplikasi.
              </p>
            </div>
          )}
          </MorphSwap>
        </Modal>
          )
        }
      </Presence>
      <DialogHost />
      <Presence when={toast || null}>
        {(exiting) => (
          <div
            className={`toast ${exiting ? "is-exiting" : ""}`}
            role="status"
          >
            <Check size={17} className="m-pop-in" />
            {toast}
            <button aria-label="Tutup pesan" onClick={() => setToast("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </Presence>
    </div>
  );
}

/**
 * Bottom floating nav (phone width). "+" morphs the pill into an action pill:
 * [× tutup] [Uang keluar] [Uang masuk] [Cek sebelum beli]; choosing one morphs it back
 * and opens that dialog.
 */
function MobileNav({
  page,
  navigate,
  openDialog,
}: {
  page: Page;
  navigate: (page: Page) => void;
  openDialog: (dialog: Dialog) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useMorphMenu(ref, open, setOpen, {
    first: ".nav-primary",
    trigger: ".nav-add",
  });
  const choose = (dialog: Dialog) => {
    setOpen(false);
    openDialog(dialog);
  };
  const tabs = [
    { id: "home", label: "Beranda", Icon: LayoutDashboard },
    { id: "plans", label: "Rencana", Icon: Wallet },
    { id: "insights", label: "Statistik", Icon: ChartNoAxesCombined },
    { id: "calendar", label: "Kalender", Icon: CalendarDays },
  ] as const;
  const tab = ({ id, label, Icon }: (typeof tabs)[number]) => (
    <button
      key={id}
      className={page === id ? "active" : ""}
      aria-label={label}
      aria-current={page === id ? "page" : undefined}
      onClick={() => navigate(id)}
    >
      <Icon size={20} />
    </button>
  );
  return (
    <MorphSwap
      as="nav"
      className="mobile-nav"
      layerClassName="nav-layer"
      containerRef={ref}
      swapKey={open ? "actions" : "nav"}
      morph="both"
      aria-label="Navigasi mobile"
    >
      {open ? (
        <>
          <button
            className="nav-action nav-close"
            aria-label="Tutup pilihan catat"
            onClick={() => setOpen(false)}
          >
            <X size={19} />
          </button>
          <button
            className="nav-action nav-primary"
            onClick={() => choose({ type: "transaction", kind: "expense" })}
          >
            <ArrowUpRight size={17} />
            Uang keluar
          </button>
          <button
            className="nav-action"
            onClick={() => choose({ type: "transaction", kind: "income" })}
          >
            <ArrowDownLeft size={17} />
            Uang masuk
          </button>
          <button
            className="nav-action"
            onClick={() => choose({ type: "check" })}
          >
            <Scale size={17} />
            Cek sebelum beli
          </button>
        </>
      ) : (
        <>
          <TabIndicator active={page} />
          {tabs.slice(0, 2).map(tab)}
          <button
            className="nav-add"
            aria-label="Catat transaksi"
            aria-expanded={false}
            onClick={() => setOpen(true)}
          >
            <Plus size={25} />
          </button>
          {tabs.slice(2).map(tab)}
        </>
      )}
    </MorphSwap>
  );
}

function FreshSetup({ start }: { start: (state: AppState) => void }) {
  const [profile, setProfile] = useState(defaultState().profile);
  const [items, setItems] = useState<DailyItemDraft[]>([]);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          start(initialState(profile, items));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Profil belum valid.");
        }
      }}
    >
      <p className="form-hint">
        Data contoh akan diganti dengan catatan kosong milikmu.
      </p>
      <ProfileFields
        profile={profile}
        setProfile={setProfile}
        items={items}
        setItems={setItems}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button dark full">
        Mulai mencatat <ArrowUpRight size={17} />
      </button>
    </form>
  );
}
function AuthForm({ done }: { done: () => void }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cloud) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (register) {
        const result = await cloud.signUp(
          String(data.get("email")),
          String(data.get("password")),
        );
        if (result.confirmationRequired) {
          setError("Cek email untuk konfirmasi akun, lalu masuk di sini.");
          setRegister(false);
          return;
        }
      } else
        await cloud.signIn(
          String(data.get("email")),
          String(data.get("password")),
        );
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email atau password salah.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-form-wrap">
      <div className="auth-form-header">
        <div className="auth-form-icon">
          <ShieldCheck size={26} strokeWidth={1.8} />
        </div>
        <h2 className="auth-form-title">
          {register ? "Buat akun DanaSiap" : "Masuk ke DanaSiap"}
        </h2>
        <p className="auth-form-sub">
          {register
            ? "Catatan tersimpan di cloud dan bisa diakses dari mana saja."
            : "Lanjutkan dari mana saja — data tersinkron otomatis."}
        </p>
      </div>
      <form onSubmit={submit} className="auth-form-body">
        <label className="field">
          Email
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nama@email.com"
          />
        </label>
        <label className="field">
          Password
          <input
            required
            type="password"
            name="password"
            minLength={8}
            autoComplete={register ? "new-password" : "current-password"}
            placeholder={register ? "Minimal 8 karakter" : "Password kamu"}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button dark full" disabled={busy || !cloud}>
          {busy ? "Sebentar…" : register ? "Buat akun" : "Masuk"}
          <ArrowUpRight size={17} />
        </button>
        <button
          type="button"
          className="text-button auth-switch"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Sudah punya akun? Masuk"
            : "Belum punya akun? Daftar gratis"}
        </button>
      </form>
    </div>
  );
}

function Settings({
  state,
  save,
  saveItems,
  session,
  cloudReady,
  syncStatus,
  syncError,
  signIn,
  connectData,
  signOut,
  exportData,
  importData,
}: {
  state: AppState;
  save: (p: Profile, items: DailyItemDraft[]) => void;
  saveItems: (items: DailyItemDraft[]) => void;
  session: Session | null;
  cloudReady: boolean;
  syncStatus: string;
  syncError: string;
  signIn: () => void;
  connectData: (direction: "upload" | "download") => Promise<void>;
  signOut: () => Promise<void>;
  exportData: () => void;
  importData: (f?: File) => Promise<void>;
}) {
  const [profile, setProfile] = useState(state.profile);
  const [items, setItems] = useState(() => draftDailyItems(state));
  const [error, setError] = useState("");
  useEffect(() => {
    setProfile(state.profile);
    setError("");
  }, [state.profile]);
  useEffect(() => {
    setItems(draftDailyItems(state));
  }, [state.dailyItems]);
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">SESUAIKAN DENGAN HIDUPMU</span>
          <h1>Pengaturan</h1>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <PanelHeading title="Profil & kebiasaan" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                save(validatedProfile(profile), items);
                setError("");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Tidak bisa menyimpan.",
                );
              }
            }}
          >
            <ProfileFields
              profile={profile}
              setProfile={setProfile}
              items={items}
              setItems={setItems}
              commitItems={saveItems}
            />
            <p className="form-hint">
              Mengubah saldo awal akan menghitung ulang seluruh saldo. Untuk
              pemasukan baru, gunakan Catat transaksi.
            </p>
            {error && <p className="form-error">{error}</p>}
            <button className="button dark full">
              Simpan pengaturan <Check size={17} />
            </button>
          </form>
        </section>
        <div className="settings-aside">
          <section className="panel">
            <PanelHeading title="Akun & sinkronisasi" />
            <div className="cloud-icon">
              <Cloud size={28} />
            </div>
            <h3>
              {session
                ? session.user.email
                : cloudReady
                  ? "Bawa catatanmu ke mana saja"
                  : "Catatan lokal siap dipakai"}
            </h3>
            <p className="muted settings-copy">
              {session
                ? "Hubungkan catatan perangkat sekali, lalu perubahan tersimpan otomatis. Muat dari cloud untuk mengambil perubahan perangkat lain."
                : cloudReady
                  ? "Masuk dengan akun yang sama di Android dan web."
                  : "Penyimpanan cloud belum diaktifkan. Catatan dan prediksi tetap berjalan di perangkat ini."}
            </p>
            {session ? (
              <>
                <div className="settings-buttons">
                  <button
                    className="button lime"
                    disabled={syncStatus === "saving"}
                    onClick={() => void connectData("upload")}
                  >
                    <RefreshCw size={16} />{" "}
                    {syncStatus === "saving" ? "Menyimpan…" : "Sinkronkan"}
                  </button>
                  <button
                    className="button light"
                    disabled={syncStatus === "saving"}
                    onClick={() => void connectData("download")}
                  >
                    <Download size={16} /> Muat dari cloud
                  </button>
                </div>
                <button
                  className="text-button signout"
                  onClick={() => void signOut()}
                >
                  <LogOut size={15} /> Keluar akun
                </button>
              </>
            ) : (
              <button
                className="button dark full"
                onClick={signIn}
                disabled={!cloudReady}
              >
                {cloudReady ? "Masuk / daftar" : "Cloud belum tersambung"}
                <ArrowUpRight size={17} />
              </button>
            )}
            {syncError && (
              <p role="alert" className="form-error">
                {syncError}
              </p>
            )}
          </section>
          <section className="panel">
            <PanelHeading title="Cadangan data" />
            <p className="muted settings-copy">
              Unduh salinan catatan untuk disimpan atau dipindahkan ke perangkat
              lain.
            </p>
            <div className="settings-buttons">
              <button className="button light" onClick={exportData}>
                <Download size={16} /> Ekspor JSON
              </button>
              <label className="button light file-input">
                <Upload size={16} /> Impor cadangan
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    void importData(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>
          <section className="settings-small">
            <ShieldCheck size={19} />
            <p>
              DanaSiap mencatat dan membantu merencanakan. Saldo di sini tidak
              terhubung ke rekening bank.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
