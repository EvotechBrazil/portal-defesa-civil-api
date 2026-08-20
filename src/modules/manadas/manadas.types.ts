export interface ManadaView {
  id: string;
  name: string;
  country: string;
  state: string;
  city: string;
}

export interface ManadaListResult {
  automatic: ManadaView[];
  others: ManadaView[];
}

export interface CreateManadaInput {
  name: string;
  country: string;
  state: string;
  city: string;
}
