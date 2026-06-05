"use client";

import { useEffect, useState } from "react";

type Props = {
  name: string;
  initialEmail: string;
};

export default function AccountEmailField({ name, initialEmail }: Props) {
  const [value, setValue] = useState(initialEmail);

  useEffect(() => {
    setValue(initialEmail);
  }, [initialEmail]);

  return (
    <input
      name={name}
      type="email"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      autoComplete="off"
      spellCheck={false}
      inputMode="email"
      required
      className="w-full rounded border p-3"
    />
  );
}