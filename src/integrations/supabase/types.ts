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
          codtmv: string | null
          complemento: string | null
          contacontabil: string | null
          data: string
          documento: string | null
          id: number
          importacao_id: string | null
          nomecoligada: string | null
          nomeconta: string | null
          nomecusto: string | null
          nomedepto: string | null
          produto: string | null
          vcodconta: string | null
          vlcusto: number
        }
        Insert: {
          codccusto?: string | null
          codcoligada?: string | null
          coddepartamento?: string | null
          codtmv?: string | null
          complemento?: string | null
          contacontabil?: string | null
          data: string
          documento?: string | null
          id?: number
          importacao_id?: string | null
          nomecoligada?: string | null
          nomeconta?: string | null
          nomecusto?: string | null
          nomedepto?: string | null
          produto?: string | null
          vcodconta?: string | null
          vlcusto?: number
        }
        Update: {
          codccusto?: string | null
          codcoligada?: string | null
          coddepartamento?: string | null
          codtmv?: string | null
          complemento?: string | null
          contacontabil?: string | null
          data?: string
          documento?: string | null
          id?: number
          importacao_id?: string | null
          nomecoligada?: string | null
          nomeconta?: string | null
          nomecusto?: string | null
          nomedepto?: string | null
          produto?: string | null
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
      bp_dre_pendencias: {
        Args: { p_ano?: number; p_empresa_id?: string; p_mes?: number }
        Returns: {
          conta: string
          descricao: string
          qtd: number
          valor: number
        }[]
      }
      desp_adm_lancamentos: {
        Args: {
          p_ano: number
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
