export class vec2
{
  x = 0;
  y = 0;

  constructor(x = 0, y = 0)
  {
    this.x = x;
    this.y = y;
  }

  sub(vec: vec2)
  {
    const { x: ax, y: ay } = this;
    const { x: bx, y: by } = vec;

    return new vec2(ax - bx, ay - by);
  }

  add(vec: vec2)
  {
    const { x: ax, y: ay } = this;
    const { x: bx, y: by } = vec;

    return new vec2(ax + bx, ay + by);
  }

  scale(scalar: number)
  {
    const { x, y } = this;

    return new vec2(x * scalar, y * scalar);
  }

  cross(vec: vec2)
  {
    const { x: ax, y: ay } = this;
    const { x: bx, y: by } = vec;

    return ax * by - ay * bx;
  }

  length()
  {
    const { x, y } = this;

    return Math.hypot(x, y);
  }
}

export default vec2;
