CREATE TABLE public.ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_email text,
  categoria text NOT NULL,
  linha_negocio text NOT NULL,
  safra_ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor numeric NOT NULL DEFAULT 0,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes TO authenticated;
GRANT ALL ON public.ajustes TO service_role;

ALTER TABLE public.ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ajustes select auth" ON public.ajustes FOR SELECT TO authenticated USING (true);
CREATE POLICY "ajustes insert auth" ON public.ajustes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ajustes update own" ON public.ajustes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ajustes delete own" ON public.ajustes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_ajustes_updated_at BEFORE UPDATE ON public.ajustes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX ajustes_periodo_idx ON public.ajustes (safra_ano, mes);