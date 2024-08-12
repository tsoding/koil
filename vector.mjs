export class RGBA {
    r;
    g;
    b;
    a;
    constructor(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    toStyle() {
        return `rgba(`
            + `${Math.floor(this.r * 255)}, `
            + `${Math.floor(this.g * 255)}, `
            + `${Math.floor(this.b * 255)}, `
            + `${this.a})`;
    }
}
export class Vector2 {
    x;
    y;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    setPolar(angle, len = 1) {
        this.x = Math.cos(angle) * len;
        this.y = Math.sin(angle) * len;
        return this;
    }
    clone() {
        return new Vector2(this.x, this.y);
    }
    copy(that) {
        this.x = that.x;
        this.y = that.y;
        return this;
    }
    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
    setScalar(scalar) {
        this.x = scalar;
        this.y = scalar;
        return this;
    }
    add(that) {
        this.x += that.x;
        this.y += that.y;
        return this;
    }
    sub(that) {
        this.x -= that.x;
        this.y -= that.y;
        return this;
    }
    div(that) {
        this.x /= that.x;
        this.y /= that.y;
        return this;
    }
    mul(that) {
        this.x *= that.x;
        this.y *= that.y;
        return this;
    }
    sqrLength() {
        return this.x * this.x + this.y * this.y;
    }
    length() {
        return Math.sqrt(this.sqrLength());
    }
    angle() {
        return Math.atan2(this.y, this.x);
    }
    scale(value) {
        this.x *= value;
        this.y *= value;
        return this;
    }
    norm() {
        const l = this.length();
        return l === 0 ? this : this.scale(1 / l);
    }
    rot90() {
        const oldX = this.x;
        this.x = -this.y;
        this.y = oldX;
        return this;
    }
    sqrDistanceTo(that) {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        return dx * dx + dy * dy;
    }
    distanceTo(that) {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that, t) {
        this.x += (that.x - this.x) * t;
        this.y += (that.y - this.y) * t;
        return this;
    }
    dot(that) {
        return this.x * that.x + this.y * that.y;
    }
    map(f) {
        this.x = f(this.x);
        this.y = f(this.y);
        return this;
    }
}
export class Vector3 {
    x;
    y;
    z;
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    clone() {
        return new Vector3(this.x, this.y, this.z);
    }
    clone2() {
        return new Vector2(this.x, this.y);
    }
    copy(that) {
        this.x = that.x;
        this.y = that.y;
        this.z = that.z;
        return this;
    }
    copy2(that, z) {
        this.x = that.x;
        this.y = that.y;
        this.z = z;
        return this;
    }
    setScalar(scalar) {
        this.x = scalar;
        this.y = scalar;
        this.z = scalar;
        return this;
    }
    add(that) {
        this.x += that.x;
        this.y += that.y;
        this.z += that.z;
        return this;
    }
    sub(that) {
        this.x -= that.x;
        this.y -= that.y;
        this.z -= that.z;
        return this;
    }
    div(that) {
        this.x /= that.x;
        this.y /= that.y;
        this.z /= that.z;
        return this;
    }
    mul(that) {
        this.x *= that.x;
        this.y *= that.y;
        this.z *= that.z;
        return this;
    }
    sqrLength() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    length() {
        return Math.sqrt(this.sqrLength());
    }
    scale(value) {
        this.x *= value;
        this.y *= value;
        this.z *= value;
        return this;
    }
    norm() {
        const l = this.length();
        return l === 0 ? this : this.scale(1 / l);
    }
    sqrDistanceTo(that) {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        const dz = that.z - this.z;
        return dx * dx + dy * dy + dz * dz;
    }
    distanceTo(that) {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that, t) {
        this.x += (that.x - this.x) * t;
        this.y += (that.y - this.y) * t;
        this.z += (that.z - this.z) * t;
        return this;
    }
    dot(that) {
        return this.x * that.x + this.y * that.y + this.z * that.z;
    }
    map(f) {
        this.x = f(this.x);
        this.y = f(this.y);
        this.z = f(this.z);
        return this;
    }
}
//# sourceMappingURL=vector.mjs.map