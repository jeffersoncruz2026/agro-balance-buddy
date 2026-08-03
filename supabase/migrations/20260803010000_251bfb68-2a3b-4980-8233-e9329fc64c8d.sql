-- Sistema de aprovação de cadastros com controle de acesso por papéis.
-- Papel do usuário fica numa tabela própria (user_roles), nunca em
-- profiles/metadata, para não abrir brecha de auto-promoção via updates
-- em profiles. has_role() é SECURITY DEFINER para as políticas de RLS
-- poderem checar papel sem recursão (RLS em user_roles não pode chamar
-- uma query que dependa da própria RLS de user_roles).

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.profile_status AS ENUM ('pendente', 'aprovado', 'rejeitado');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  status public.profile_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Checa papel sem recursão de RLS (SECURITY DEFINER ignora a RLS de
-- user_roles ao executar a própria consulta interna da função).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Impede que o próprio usuário (não-admin) mude seu status de
-- 'pendente'/'rejeitado' para 'aprovado' via update direto na sua linha.
CREATE OR REPLACE FUNCTION public.prevent_status_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o status do cadastro.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_status_self_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_status_self_escalation();

-- Ao cadastrar (auth.users), cria o perfil e o papel automaticamente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email);

  IF NEW.email = 'jeffersoncardosomb@gmail.com' THEN
    INSERT INTO public.profiles (id, email, nome, status)
    VALUES (NEW.id, NEW.email, v_nome, 'aprovado');
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.profiles (id, email, nome, status)
    VALUES (NEW.id, NEW.email, v_nome, 'pendente');
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: profiles
CREATE POLICY "Usuarios veem o proprio perfil" ON public.profiles
FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins veem todos os perfis" ON public.profiles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuarios atualizam o proprio perfil" ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins atualizam qualquer perfil" ON public.profiles
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- RLS: user_roles — leitura e escrita restritas a admin.
CREATE POLICY "Admins veem todos os papeis" ON public.user_roles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins gerenciam papeis" ON public.user_roles
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
