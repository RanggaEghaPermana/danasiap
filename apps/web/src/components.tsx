import { useState, useEffect, useRef, useId, type ReactNode } from "react";
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
} from "lucide-react";
import { currency, formatThousands, parseThousands, type Need, type Transaction } from "@danasiap/core";

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
export function Money({
  amount,
  className = "",
}: {
  amount: number;
  className?: string;
}) {
  return (
    <span className={`money ${className}`}>{currency(Math.round(amount))}</span>
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
export function Modal({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={headingId}
      onCancel={close}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      {title ? (
        <div className="modal-heading">
          <div>
            <h2 id={headingId}>{title}</h2>
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
      )}
      {children}
    </dialog>
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
export function NeedCard({ need, onOpen }: { need: Need; onOpen: () => void }) {
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
      className={`need-card ${need.kind === "recurring" ? "lime" : ""}`}
      onClick={onOpen}
    >
      <div className="need-top">
        <span className="need-symbol">
          <CategoryIcon
            category={need.kind === "debt" ? "utang" : need.title}
          />
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
}: {
  transaction: Transaction;
  onClick?: () => void;
}) {
  const isIncome = transaction.type === "income";
  return (
    <button
      className="transaction-row"
      onClick={onClick}
      aria-label={`${transaction.title}, ${isIncome ? "pemasukan" : "pengeluaran"} ${currency(transaction.amount)}`}
    >
      <span className={`transaction-icon ${isIncome ? "income" : ""}`}>
        <CategoryIcon category={transaction.category} />
      </span>
      <span className="transaction-info">
        <strong>{transaction.title}</strong>
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
          <span>{currentOption ? currentOption.label : placeholder}</span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`custom-select-chevron ${open ? "rotate" : ""}`}
        />
      </button>

      {open && (
        <div className="custom-select-menu" role="listbox">
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
          <div className="custom-select-options-list">
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
                        <span className="custom-select-option-label">{opt.label}</span>
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


