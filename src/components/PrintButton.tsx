'use client';

export default function PrintButton() {
  return (
    <button className="btn btn-primary" type="button" onClick={() => window.print()}>
      Print this sheet
    </button>
  );
}
