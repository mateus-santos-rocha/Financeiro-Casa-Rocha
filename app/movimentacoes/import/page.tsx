import { ImportForm } from "@/components/ImportForm";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Importar CSV</h1>
      <ImportForm />
      <p className="text-sm text-slate-500">
        <a className="underline" href="/movimentacoes">← Voltar para Movimentações</a>
      </p>
    </div>
  );
}
