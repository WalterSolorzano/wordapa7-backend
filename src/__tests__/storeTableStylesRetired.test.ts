import { describe, it, expect } from 'vitest';
import { useDocStore } from '../store/useDocStore';

describe('tableStyles retirado', () => {
  it('tableStyles y setTableStyle ya no existen en el store', () => {
    const st: any = useDocStore.getState();
    expect(st.tableStyles).toBeUndefined();
    expect(st.setTableStyle).toBeUndefined();
  });
});
