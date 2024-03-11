export default class Int128 {
  static Int128Mul(lhs: number, rhs: number): BigInt {
    return BigInt(Math.round(lhs)) * BigInt(Math.round(rhs));
  }

  static op_Equality(num1: BigInt, num2: BigInt): boolean {
    return num1 === num2;
  }
}
