import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  Fuel,
  ShoppingBag,
  Wallet,
  ReceiptText,
  Target,
  Coffee,
  BriefcaseBusiness,
  Ellipsis,
  ChevronDown,
  Check,
  Search,
  ShoppingBasket,
  Zap,
  Flame,
  CreditCard,
  Repeat,
} from "lucide-react";
import {
  currency,
  formatThousands,
  parseThousands,
  isElectricityNeed,
  isGasNeed,
  isShoppingNeed,
  type Need,
  type Transaction,
} from "@danasiap/core";
import {
  AnimatedValue,
  Marquee,
  Presence,
  SPRING,
  SPRING_MS,
  REDUCED_MS,
  reducedMotion,
  triggerPoint,
  useAutoMorph,
} from "./motion";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <img src="/favicon.svg" alt="" />
      <span>
        DanaSiap<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
/** A rupiah amount. Changes animate (old value blurs up and out, new one blurs in). */
export function Money({
  amount,
  className = "",
  hold,
  flyTarget,
}: {
  amount: number;
  className?: string;
  /** Wait for a flyTo() chip aimed at this key before showing a new value. */
  hold?: string;
  /** Marks this amount as a landing spot for flyTo(). */
  flyTarget?: string;
}) {
  return (
    <span className={`money ${className}`} data-fly-target={flyTarget}>
      <AnimatedValue value={currency(Math.round(amount))} hold={hold} />
    </span>
  );
}
export function DateLabel({
  date,
  full = false,
}: {
  date: string;
  full?: boolean;
}) {
  return (
    <>
      {new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: full ? "long" : "short",
        ...(full ? { year: "numeric" } : {}),
      }).format(new Date(`${date}T12:00:00+07:00`))}
    </>
  );
}
/** The dialog surface. It grows from the control that opened it and springs to new heights. */
export function Modal({
  children,
  close,
  exiting = false,
  labelledBy,
  className = "",
}: {
  children: ReactNode;
  close: () => void;
  exiting?: boolean;
  labelledBy?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useAutoMorph(ref, "height");
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.showModal();
    // Pattern 9: appear with blur + scale, growing from the trigger.
    const reduced = reducedMotion();
    const rect = node.getBoundingClientRect();
    const point = triggerPoint();
    let shift = "0px 10px";
    if (point && !reduced) {
      const ox = Math.min(Math.max(point.x - rect.left, 0), rect.width);
      const oy = Math.min(Math.max(point.y - rect.top, 0), rect.height);
      node.style.transformOrigin = `${ox}px ${oy}px`;
      const clamp = (v: number) => Math.max(-40, Math.min(40, v));
      shift = `${clamp((point.x - rect.left - rect.width / 2) * 0.12)}px ${clamp((point.y - rect.top - rect.height / 2) * 0.12)}px`;
    }
    const appear = node.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, filter: "blur(8px)", scale: 0.96, translate: shift },
            { opacity: 1, filter: "blur(0px)", scale: 1, translate: "0px 0px" },
          ],
      {
        duration: reduced ? REDUCED_MS : SPRING_MS,
        easing: reduced ? "linear" : SPRING,
      },
    );
    return () => {
      appear.cancel();
      node.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className} ${exiting ? "is-exiting" : ""}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // Close through React so the dialog can animate out.
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      {children}
    </dialog>
  );
}

/** Title row of a dialog (it swaps together with the dialog content). */
export function ModalHeading({
  id,
  title,
  subtitle,
  close,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  close: () => void;
}) {
  return title ? (
    <div className="modal-heading">
      <div>
        <h2 id={id}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button className="icon-button" aria-label="Tutup" onClick={close}>
        <X size={20} />
      </button>
    </div>
  ) : (
    <div className="modal-close-only">
      <button className="icon-button" aria-label="Tutup" onClick={close}>
        <X size={20} />
      </button>
    </div>
  );
}
export function PanelHeading({
  title,
  action,
  onClick,
  subtitle,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
  subtitle?: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function CategoryIcon({
  category,
  size = 20,
}: {
  category: string;
  size?: number;
}) {
  const text = category.toLowerCase();
  const Icon = /bensin|transport|fuel/.test(text)
    ? Fuel
    : /makan|kopi|jajan/.test(text)
      ? Coffee
      : /utang|cicil|tagih/.test(text)
        ? ReceiptText
        : /tabung|goal|target/.test(text)
          ? Target
          : /gaji|kerja|income|pendapatan/.test(text)
            ? BriefcaseBusiness
            : /belanja|kebutuhan/.test(text)
              ? ShoppingBag
              : Wallet;
  return <Icon size={size} strokeWidth={1.6} />;
}
/** Icon by what the need is: monthly shopping, token, gas, debt, savings goal, or a routine bill. */
export function NeedIcon({ need, size = 20 }: { need: Need; size?: number }) {
  const Icon = isShoppingNeed(need)
    ? ShoppingBasket
    : isElectricityNeed(need)
      ? Zap
      : isGasNeed(need)
        ? Flame
        : need.kind === "debt"
          ? CreditCard
          : need.kind === "goal"
            ? Target
            : Repeat;
  return <Icon size={size} strokeWidth={1.6} />;
}
export function NeedCard({
  need,
  onOpen,
  className = "",
}: {
  need: Need;
  onOpen: () => void;
  className?: string;
}) {
  const remaining = Math.max(0, need.amount - (need.paidAmount || 0));
  const progress = need.paid
    ? 100
    : Math.min(
        100,
        ((need.saved + (need.paidAmount || 0)) / Math.max(need.amount, 1)) *
          100,
      );
  return (
    <button
      className={`need-card ${need.kind === "recurring" ? "lime" : ""} ${className}`}
      onClick={onOpen}
    >
      <div className="need-top">
        <span className="need-symbol">
          <NeedIcon need={need} />
        </span>
        <Ellipsis size={19} />
      </div>
      <h3>{need.title}</h3>
      <p>
        <DateLabel date={need.dueDate} />{" "}
        <span>
          ·{" "}
          {need.kind === "debt"
            ? "Utang"
            : need.kind === "recurring"
              ? "Rutin"
              : "Target"}
        </span>
      </p>
      <Money amount={remaining} />
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="need-bottom">
        <span>
          {need.paid ? "Lunas" : `${Math.round(progress)}% disiapkan`}
        </span>
        <ArrowUpRight size={15} />
      </div>
    </button>
  );
}
export function TransactionRow({
  transaction,
  onClick,
  className = "",
}: {
  transaction: Transaction;
  onClick?: () => void;
  className?: string;
}) {
  const isIncome = transaction.type === "income";
  return (
    <button
      className={`transaction-row ${className}`}
      onClick={onClick}
      aria-label={`${transaction.title}, ${isIncome ? "pemasukan" : "pengeluaran"} ${currency(transaction.amount)}`}
    >
      <span className={`transaction-icon ${isIncome ? "income" : ""}`}>
        <CategoryIcon category={transaction.category} />
      </span>
      <span className="transaction-info">
        <strong>
          <Marquee>{transaction.title}</Marquee>
        </strong>
        <span>
          {transaction.category} <i>·</i> <DateLabel date={transaction.date} />
        </span>
      </span>
      <strong className={`transaction-amount ${isIncome ? "positive" : ""}`}>
        {isIncome ? "+" : "−"}
        {currency(transaction.amount)}
      </strong>
    </button>
  );
}
/** Case-insensitive "contains" over any of the given texts. */
export function matchesQuery(query: string, ...texts: (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  return !q || texts.some((text) => text?.toLowerCase().includes(q));
}
/** Search box with a magnifier and a clear (×) button. The × fades in inside a fixed slot. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = "",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label className={`search-field ${className}`}>
      <Search size={17} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
      />
      <span className="search-clear-slot">
        <Presence when={value ? "clear" : null}>
          {(exiting) => (
            <button
              type="button"
              className={`search-clear m-pop-in m-close ${exiting ? "is-exiting" : ""}`}
              aria-label="Hapus pencarian"
              onClick={(e) => {
                e.preventDefault();
                onChange("");
                input.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          )}
        </Presence>
      </span>
    </label>
  );
}
/** "Nothing matches" line for a filtered list. */
export function NoMatch({ query }: { query: string }) {
  return (
    <p className="no-match">
      Tidak ada yang cocok dengan “{query.trim()}”.
    </p>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <span>{icon}</span>}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}


export function CardChip({ className = "" }: { className?: string }) {
  return (
    <div className={`card-chip ${className}`} aria-hidden="true">
      <svg width="38" height="28" viewBox="0 0 38 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="38" height="28" rx="5" fill="#c8ed69" fillOpacity="0.22" stroke="#c8ed69" strokeWidth="1.2" />
        <rect x="2" y="2" width="34" height="24" rx="3.5" fill="#c8ed69" fillOpacity="0.08" />
        <path d="M0 10H14M0 18H14M24 10H38M24 18H38M14 4V24M24 4V24M14 14H24" stroke="#c8ed69" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
        <circle cx="19" cy="14" r="2.5" fill="#c8ed69" opacity="0.7" />
      </svg>
    </div>
  );
}

export function MoneyInput({
  value,
  defaultValue,
  onChange,
  placeholder = "0",
  required = false,
  autoFocus = false,
  name,
  id,
  className = "",
  min,
  max = 1_000_000_000_000,
  disabled,
}: {
  value?: number;
  defaultValue?: number;
  onChange?: (val: number) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  name?: string;
  id?: string;
  className?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const isControlled = value !== undefined;
  const initialNum = isControlled ? value : (defaultValue ?? 0);
  const [internalVal, setInternalVal] = useState(initialNum);
  const [text, setText] = useState(() => (initialNum ? formatThousands(initialNum) : ""));

  useEffect(() => {
    if (isControlled) {
      const parsed = parseThousands(text);
      if (parsed !== value) {
        setText(value ? formatThousands(value) : "");
        setInternalVal(value);
      }
    }
  }, [value, isControlled]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setText("");
      setInternalVal(0);
      onChange?.(0);
      return;
    }
    const num = parseThousands(raw);
    const bounded = max !== undefined ? Math.min(max, num) : num;
    setText(formatThousands(bounded));
    setInternalVal(bounded);
    onChange?.(bounded);
  };

  const currentVal = isControlled ? value : internalVal;

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={className}
        autoFocus={autoFocus}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={handleChange}
      />
      {name && <input type="hidden" name={name} value={currentVal} />}
    </>
  );
}

export interface SelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
}

export function CustomSelect({
  options,
  value,
  defaultValue,
  onChange,
  name,
  id,
  className = "",
  placeholder = "Pilih opsi...",
  searchable = false,
  disabled = false,
  "aria-label": ariaLabelProp,
  ariaLabel,
}: {
  options: (SelectOption | string | number)[];
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (val: any) => void;
  name?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  ariaLabel?: string;
}) {
  const ariaLabelText = ariaLabelProp || ariaLabel;
  const isControlled = value !== undefined;
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === "object" && opt !== null && "value" in opt) {
      return opt as SelectOption;
    }
    return { value: opt, label: String(opt) };
  });

  const [internalVal, setInternalVal] = useState<string | number>(
    () => (isControlled ? value! : (defaultValue ?? (normalizedOptions[0]?.value ?? "")))
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const currentVal = isControlled ? value : internalVal;

  const currentOption = normalizedOptions.find(
    (o) => String(o.value) === String(currentVal)
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (val: string | number) => {
    if (!isControlled) {
      setInternalVal(val);
    }
    onChange?.(val);
    setOpen(false);
  };

  const showSearch = searchable || normalizedOptions.length > 8;
  const filtered = search.trim()
    ? normalizedOptions.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
      )
    : normalizedOptions;

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${open ? "is-open" : ""} ${className}`}
    >
      <button
        type="button"
        id={id}
        aria-label={ariaLabelText}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className="custom-select-trigger"
        onClick={() => !disabled && setOpen(!open)}
      >
        <span className="custom-select-trigger-label">
          {currentOption?.icon && (
            <span className="custom-select-icon">{currentOption.icon}</span>
          )}
          <Marquee>{currentOption ? currentOption.label : placeholder}</Marquee>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`custom-select-chevron ${open ? "rotate" : ""}`}
        />
      </button>

      <Presence when={open}>
        {(exiting) => (
        <div
          className={`custom-select-menu m-menu ${exiting ? "is-exiting" : ""}`}
          role="listbox"
        >
          {showSearch && (
            <div className="custom-select-search-wrap">
              <Search size={14} className="custom-select-search-icon" />
              <input
                type="text"
                autoFocus
                placeholder="Cari pilihan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="custom-select-search-input"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div
            className={`custom-select-options-list m-stagger ${exiting ? "is-exiting" : ""}`}
          >
            {filtered.length === 0 ? (
              <div className="custom-select-empty">Tidak ada pilihan yang cocok</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = String(opt.value) === String(currentVal);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`custom-select-option ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <div className="custom-select-option-content">
                      {opt.icon && (
                        <span className="custom-select-icon">{opt.icon}</span>
                      )}
                      <div className="custom-select-option-text">
                        <span className="custom-select-option-label"><Marquee>{opt.label}</Marquee></span>
                        {opt.sublabel && (
                          <span className="custom-select-option-sublabel">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={16} strokeWidth={2.5} className="custom-select-check" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
        )}
      </Presence>

      {name && <input type="hidden" name={name} value={String(currentVal ?? "")} />}
    </div>
  );
}

export function processAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return reject(new Error("File harus berupa gambar (JPG, PNG, WebP)."));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 192;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas tidak didukung"));
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          reject(new Error("Gagal memproses gambar"));
        }
      };
      img.onerror = () => reject(new Error("Gagal membaca file gambar"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Gagal membaca berkas"));
    reader.readAsDataURL(file);
  });
}


