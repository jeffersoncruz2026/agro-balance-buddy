export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ajustes: {
        Row: {
          categoria: string
          created_at: string
          descricao: string
          id: string
          linha_negocio: string
          mes: number
          safra_ano: number
          updated_at: string
          user_email: string | null
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string
          descricao: string
          id?: string
          linha_negocio: string
          mes: number
          safra_ano: number
          updated_at?: string
          user_email?: string | null
          user_id?: string
          valor?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          descricao?: string
          id?: string
          linha_negocio?: string
          mes?: number
          safra_ano?: number
          updated_at?: string
          user_email?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      bp_dre_conta_map: {
        Row: {
          conta: string
          created_at: string
          demonstrativo: string
          descricao: string | null
          id: string
          is_prefixo: boolean
          linha: string
          ordem_exibicao: number
          secao: string | null
          updated_at: string
        }
        Insert: {
          conta: string
          created_at?: string
          demonstrativo: string
          descricao?: string | null
          id?: string
          is_prefixo?: boolean
          linha: string
          ordem_exibicao?: number
          secao?: string | null
          updated_at?: string
        }
        Update: {
          conta?: string
          created_at?: string
          demonstrativo?: string
          descricao?: string | null
          id?: string
          is_prefixo?: boolean
          linha?: string
          ordem_exibicao?: number
          secao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bp_dre_empresas: {
        Row: {
          aliases: string[]
          contador_documento: string | null
          contador_nome: string | null
          created_at: string
          id: string
          nome: string
          responsavel_documento: string | null
          responsavel_nome: string | null
          rodape_texto: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          contador_documento?: string | null
          contador_nome?: string | null
          created_at?: string
          id?: string
          nome: string
          responsavel_documento?: string | null
          responsavel_nome?: string | null
          rodape_texto?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          contador_documento?: string | null
          contador_nome?: string | null
          created_at?: string
          id?: string
          nome?: string
          responsavel_documento?: string | null
          responsavel_nome?: string | null
          rodape_texto?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bp_dre_importacoes: {
        Row: {
          ano: number
          arquivo: string
          created_at: string
          empresa_id: string
          id: string
          mes: number
          total_linhas: number
          user_id: string
        }
        Insert: {
          ano: number
          arquivo: string
          created_at?: string
          empresa_id: string
          id?: string
          mes: number
          total_linhas?: number
          user_id?: string
        }
        Update: {
          ano?: number
          arquivo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          mes?: number
          total_linhas?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bp_dre_importacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "bp_dre_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_dre_lancamentos: {
        Row: {
          ano: number
          anterior: number
          conta: string
          creditos: number
          debitos: number
          descricao: string | null
          empresa_id: string
          id: number
          importacao_id: string
          mes: number
          reduzido: string | null
          saldo_atual: number
        }
        Insert: {
          ano: number
          anterior?: number
          conta: string
          creditos?: number
          debitos?: number
          descricao?: string | null
          empresa_id: string
          id?: number
          importacao_id: string
          mes: number
          reduzido?: string | null
          saldo_atual?: number
        }
        Update: {
          ano?: number
          anterior?: number
          conta?: string
          creditos?: number
          debitos?: number
          descricao?: string | null
          empresa_id?: string
          id?: number
          importacao_id?: string
          mes?: number
          reduzido?: string | null
          saldo_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "bp_dre_lancamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "bp_dre_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_dre_lancamentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "bp_dre_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          id: boolean
          safra_start_month: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          safra_start_month?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          safra_start_month?: number
          updated_at?: string
        }
        Relationships: []
      }
      conta_map: {
        Row: {
          categoria: string
          conta: string
          created_at: string
          descricao: string | null
          id: string
          is_prefixo: boolean
        }
        Insert: {
          categoria: string
          conta: string
          created_at?: string
          descricao?: string | null
          id?: string
          is_prefixo?: boolean
        }
        Update: {
          categoria?: string
          conta?: string
          created_at?: string
          descricao?: string | null
          id?: string
          is_prefixo?: boolean
        }
        Relationships: []
      }
      custo_map: {
        Row: {
          created_at: string
          id: string
          linha_negocio: string
          nomecusto: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          linha_negocio: string
          nomecusto: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          linha_negocio?: string
          nomecusto?: string
          updated_at?: string
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          arquivo: string
          created_at: string
          id: string
          status: string
          total_linhas: number
          total_valor: number
          user_id: string
        }
        Insert: {
          arquivo: string
          created_at?: string
          id?: string
          status?: string
          total_linhas?: number
          total_valor?: number
          user_id?: string
        }
        Update: {
          arquivo?: string
          created_at?: string
          id?: string
          status?: string
          total_linhas?: number
          total_valor?: number
          user_id?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          codccusto: string | null
          codcoligada: string | null
          coddepartamento: string | null
          codfilial: string | null
          codtmv: string | null
          codund: string | null
          complemento: string | null
          contacontabil: string | null
          data: string
          divisao: string | null
          documento: string | null
          grupocontabil: string | null
          grupocontabil_n9: string | null
          histfaturamento: string | null
          id: number
          idpartida: string | null
          importacao_id: string | null
          nome_orcamento: string | null
          nomecoligada: string | null
          nomeconta: string | null
          nomecusto: string | null
          nomedepto: string | null
          produto: string | null
          produto_antigo: string | null
          quantidade: number | null
          saldounitario: number | null
          vcodconta: string | null
          vlcusto: number
        }
        Insert: {
          codccusto?: string | null
          codcoligada?: string | null
          coddepartamento?: string | null
          codfilial?: string | null
          codtmv?: string | null
          codund?: string | null
          complemento?: string | null
          contacontabil?: string | null
          data: string
          divisao?: string | null
          documento?: string | null
          grupocontabil?: string | null
          grupocontabil_n9?: string | null
          histfaturamento?: string | null
          id?: number
          idpartida?: string | null
          importacao_id?: string | null
          nome_orcamento?: string | null
          nomecoligada?: string | null
          nomeconta?: string | null
          nomecusto?: string | null
          nomedepto?: string | null
          produto?: string | null
          produto_antigo?: string | null
          quantidade?: number | null
          saldounitario?: number | null
          vcodconta?: string | null
          vlcusto?: number
        }
        Update: {
          codccusto?: string | null
          codcoligada?: string | null
          coddepartamento?: string | null
          codfilial?: string | null
          codtmv?: string | null
          codund?: string | null
          complemento?: string | null
          contacontabil?: string | null
          data?: string
          divisao?: string | null
          documento?: string | null
          grupocontabil?: string | null
          grupocontabil_n9?: string | null
          histfaturamento?: string | null
          id?: number
          idpartida?: string | null
          importacao_id?: string | null
          nome_orcamento?: string | null
          nomecoligada?: string | null
          nomeconta?: string | null
          nomecusto?: string | null
          nomedepto?: string | null
          produto?: string | null
          produto_antigo?: string | null
          quantidade?: number | null
          saldounitario?: number | null
          vcodconta?: string | null
          vlcusto?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_map: {
        Row: {
          created_at: string
          id: string
          linha_negocio: string
          produto: string
        }
        Insert: {
          created_at?: string
          id?: string
          linha_negocio: string
          produto: string
        }
        Update: {
          created_at?: string
          id?: string
          linha_negocio?: string
          produto?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string | null
          status: Database["public"]["Enums"]["profile_status"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
        }
        Relationships: []
      }
      rateio: {
        Row: {
          ano: number
          id: string
          linha_negocio: string
          mes: number
          percentual: number
        }
        Insert: {
          ano: number
          id?: string
          linha_negocio: string
          mes: number
          percentual?: number
        }
        Update: {
          ano?: number
          id?: string
          linha_negocio?: string
          mes?: number
          percentual?: number
        }
        Relationships: []
      }
      rateio_adm: {
        Row: {
          created_at: string
          id: string
          linha_negocio: string
          percentual: number
          updated_at: string
          vigencia: string
        }
        Insert: {
          created_at?: string
          id?: string
          linha_negocio: string
          percentual?: number
          updated_at?: string
          vigencia: string
        }
        Update: {
          created_at?: string
          id?: string
          linha_negocio?: string
          percentual?: number
          updated_at?: string
          vigencia?: string
        }
        Relationships: []
      }
      rateio_trib: {
        Row: {
          created_at: string
          id: string
          linha_negocio: string
          percentual: number
          updated_at: string
          vigencia: string
        }
        Insert: {
          created_at?: string
          id?: string
          linha_negocio: string
          percentual?: number
          updated_at?: string
          vigencia: string
        }
        Update: {
          created_at?: string
          id?: string
          linha_negocio?: string
          percentual?: number
          updated_at?: string
          vigencia?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      balancete: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          categoria: string
          linha: string
          qtd: number
          regra: string
          safra_ano: number
          valor: number
        }[]
      }
      balancete_detalhe: {
        Args: {
          p_ano: number
          p_categoria: string
          p_linha: string
          p_mes: number
          p_safra: number
        }
        Returns: {
          complemento: string
          contacontabil: string
          data: string
          id: number
          produto: string
          vlcusto: number
        }[]
      }
      balancete_detalhe_periodo: {
        Args: {
          p_categoria: string
          p_linha: string
          p_meses: number[]
          p_safra: number
          p_safra_linha: number
        }
        Returns: {
          complemento: string
          contacontabil: string
          data: string
          id: number
          produto: string
          vlcusto: number
        }[]
      }
      balancete_periodo: {
        Args: { p_meses: number[]; p_safra: number }
        Returns: {
          categoria: string
          linha: string
          qtd: number
          regra: string
          safra_ano: number
          valor: number
        }[]
      }
      bp_dre_lancamentos_detalhe: {
        Args: {
          p_ano?: number
          p_demonstrativo?: string
          p_empresa_id?: string
          p_linha?: string
          p_mes?: number
          p_secao?: string
        }
        Returns: {
          conta: string
          descricao: string
          id: number
          saldo_atual: number
        }[]
      }
      bp_dre_pendencias: {
        Args: { p_ano?: number; p_empresa_id?: string; p_mes?: number }
        Returns: {
          conta: string
          descricao: string
          qtd: number
          valor: number
        }[]
      }
      bp_dre_periodos: {
        Args: { p_empresa_id?: string }
        Returns: {
          ano: number
          mes: number
        }[]
      }
      bp_dre_relatorio: {
        Args: { p_ano?: number; p_empresa_id?: string; p_mes?: number }
        Returns: {
          demonstrativo: string
          linha: string
          ordem_exibicao: number
          secao: string
          valor: number
          valor_ano_anterior: number
        }[]
      }
      desp_adm_lancamentos: {
        Args: {
          p_ano: number
          p_contacontabil?: string
          p_mes: number
          p_nomecoligada?: string
          p_nomecusto?: string
          p_nomedepto?: string
        }
        Returns: {
          complemento: string
          contacontabil: string
          data: string
          id: number
          produto: string
          vlcusto: number
        }[]
      }
      desp_adm_serie: {
        Args: { p_ano_ref: number; p_mes_ref: number; p_meses?: number }
        Returns: {
          ano: number
          categoria: string
          contacontabil: string
          mes: number
          nomecoligada: string
          nomecusto: string
          nomedepto: string
          valor: number
        }[]
      }
      evolucao_saldo: {
        Args: never
        Returns: {
          ano: number
          categoria: string
          linha: string
          mes: number
          valor: number
        }[]
      }
      fn_safra_inicio: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pendencias_contas: {
        Args: never
        Returns: {
          contacontabil: string
          qtd: number
          valor: number
          vcodconta: string
        }[]
      }
      pendencias_produtos: {
        Args: never
        Returns: {
          exemplo_depto: string
          produto: string
          qtd: number
          valor: number
        }[]
      }
      perf_lancamentos: {
        Args: {
          p_atividade?: string
          p_divisao?: string
          p_fim: string
          p_ini: string
          p_nomecusto?: string
          p_nomedepto?: string
          p_tipo: string
        }
        Returns: {
          codfilial: string
          codund: string
          contacontabil: string
          data: string
          divisao: string
          documento: string
          histfaturamento: string
          id: number
          idpartida: string
          nomecoligada: string
          nomecusto: string
          nomedepto: string
          produto: string
          quantidade: number
          saldounitario: number
          vcodconta: string
          vlcusto: number
        }[]
      }
      perf_rentabilidade: {
        Args: { p_fim: string; p_ini: string }
        Returns: {
          ano: number
          atividade: string
          codfilial: string
          codund: string
          divisao: string
          mes: number
          nomecoligada: string
          nomecusto: string
          nomedepto: string
          produto: string
          quantidade: number
          tipo: string
          valor: number
        }[]
      }
      rateio_adm_vigente: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          linha_negocio: string
          percentual: number
          vigencia: string
        }[]
      }
      rateio_trib_vigente: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          linha_negocio: string
          percentual: number
          vigencia: string
        }[]
      }
      resultado_financeiro: {
        Args: { p_safra_ano: number }
        Returns: {
          ano: number
          categoria: string
          mes: number
          nomeconta: string
          valor: number
        }[]
      }
      resultado_financeiro_detalhe: {
        Args: { p_categoria: string; p_nomeconta: string; p_safra_ano: number }
        Returns: {
          complemento: string
          contacontabil: string
          data: string
          id: number
          produto: string
          vlcusto: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      profile_status: "pendente" | "aprovado" | "rejeitado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      profile_status: ["pendente", "aprovado", "rejeitado"],
    },
  },
} as const
