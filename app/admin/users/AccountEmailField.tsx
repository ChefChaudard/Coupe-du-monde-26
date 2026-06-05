"use client";

type Props = {
  name: string;
  initialEmail: string;
};

export default function AccountEmailField({ name, initialEmail }: Props) {
  return (
    <input
      name={name}
      type="text"
      defaultValue={initialEmail}
      autoComplete="off"
      spellCheck={false}
      inputMode="email"
      placeholder="email du compte (optionnel)"
      className="w-full rounded border p-3"
    />
  );
}