"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * Кнопка отправки формы с вопросом «точно?». Нужна там, где промах мышкой
 * стоит денег: «Провести» до начала занятия списывает оплаченное занятие.
 */
export default function ConfirmSubmitButton({ confirmText, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { confirmText?: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
        props.onClick?.(e);
      }}
    />
  );
}
